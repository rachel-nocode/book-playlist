"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAction, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { useSpotifySession } from "./lib/use-spotify-session";
import { useAppleMusicAuth } from "./lib/use-apple-music";
import {
  addToLocalLibrary,
  findLocalBook,
  localLibraryByGoogleId,
  subscribeLocalLibrary,
} from "./lib/local-library";

type SearchResult = {
  googleBooksId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  genreTags: string[];
};

export function BookSearch() {
  const searchByTitle = useAction(api.googleBooks.searchByTitle);
  const createBook = useMutation(api.books.create);
  const buildApplePlaylist = useAction(api.appleMusicActions.buildSoundtrack);
  const { session } = useSpotifySession();
  const { configured, ready, prefetchError, connect } = useAppleMusicAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, Id<"books">>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setSaved(localLibraryByGoogleId());
    sync();
    return subscribeLocalLibrary(sync);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = title.trim();
    if (!query || searching) {
      return;
    }

    setSearching(true);
    setError(null);
    setSearched(true);

    try {
      const nextResults = await searchByTitle({ title: query });
      setResults(nextResults);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function onPick(result: SearchResult) {
    const existingId = findLocalBook(result.googleBooksId);
    if (existingId) {
      router.push(`/books/${existingId}`);
      return;
    }
    if (savingId || !ready || session === null) {
      return;
    }

    setSavingId(result.googleBooksId);
    setError(null);

    try {
      const apple = await connect();
      const bookId = await createBook({
        googleBooksId: result.googleBooksId,
        title: result.title,
        author: result.author,
        genreTags: result.genreTags,
        moodTags: [],
        sessionId: session.sessionId ?? undefined,
        coverUrl: result.coverUrl ?? undefined,
        destination: "appleMusic",
      });
      await buildApplePlaylist({
        sessionId: session.sessionId ?? undefined,
        bookId,
        musicUserToken: apple.musicUserToken,
      });
      addToLocalLibrary(bookId, result.googleBooksId);
      setSaved((current) => ({ ...current, [result.googleBooksId]: bookId }));
      router.push(`/books/${bookId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save book");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-end">
        <label htmlFor="book-title" className="sr-only">
          Search books by title
        </label>
        <div className="relative min-w-0 flex-1">
          <input
            id="book-title"
            type="search"
            name="q"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title, author, or that one with the lighthouse"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="search"
            className="focus-ring min-h-12 w-full border-0 border-b border-rule bg-transparent px-0 py-3 text-lg text-foreground placeholder:text-ink/80 hover:border-gold/40"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !title.trim()}
          className="gold-button shrink-0"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {prefetchError ? (
        <p className="rounded-sm border border-[#7a2e2e]/50 bg-[#7a2e2e]/15 px-3 py-2 text-sm text-[#e7b4a8]" role="alert">
          {prefetchError}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-sm border border-[#7a2e2e]/50 bg-[#7a2e2e]/15 px-3 py-2 text-sm text-[#e7b4a8]" role="alert">
          {error}
        </p>
      ) : null}

      {searching ? (
        <p className="text-center text-sm text-ink" role="status">
          Pulling titles from the stacks…
        </p>
      ) : null}

      {!searching && searched && results.length === 0 && !error ? (
        <p className="text-center text-sm text-ink" role="status">
          Nothing on the shelf for that. Try a shorter title.
        </p>
      ) : null}

      {results.length > 0 ? (
        <p className="text-sm text-ink">
          Tap a book to make its Apple Music playlist.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="divide-y divide-rule/80 border-y border-rule/80" aria-label="Search results">
          {results.map((result) => {
            const isSaving = savingId === result.googleBooksId;
            const isSaved = Boolean(saved[result.googleBooksId]);

            return (
              <li key={result.googleBooksId}>
                <button
                  type="button"
                  onClick={() => void onPick(result)}
                  disabled={
                    isSaving ||
                    savingId !== null ||
                    (!isSaved &&
                      (session === null || !ready || configured === false))
                  }
                  className="focus-ring flex min-h-28 w-full items-start gap-4 py-4 text-left transition-colors hover:bg-[#1d1813] disabled:opacity-70"
                >
                  <Cover title={result.title} url={result.coverUrl} />
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="block font-serif text-xl leading-snug text-foreground">
                      {result.title}
                    </span>
                    <span className="mt-1 block text-sm text-ink">
                      {result.author}
                    </span>
                    {result.genreTags.length > 0 ? (
                      <span className="mt-2 block text-xs text-ink/80">
                        {result.genreTags.slice(0, 3).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 shrink-0 text-xs font-semibold uppercase tracking-wide text-gold">
                    {isSaved
                      ? "On your shelf"
                      : isSaving
                        ? "Scoring…"
                        : session === null ||
                            (!ready && configured !== false)
                          ? "Loading…"
                          : "Want soundtrack"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Cover({ title, url }: { title: string; url: string | null }) {
  if (!url) {
    return (
      <span
        className="cover-shadow flex h-[105px] w-[70px] shrink-0 items-center justify-center bg-[#261f18] font-serif text-2xl text-gold"
        aria-hidden
      >
        {title.charAt(0)}
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={70}
      height={105}
      className="h-[105px] w-[70px] shrink-0 object-cover cover-shadow"
    />
  );
}
