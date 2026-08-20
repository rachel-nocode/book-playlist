"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAction, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { useSpotifySession } from "./lib/use-spotify-session";

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
  const { session } = useSpotifySession();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, Id<"books">>>({});
  const [error, setError] = useState<string | null>(null);

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
    if (savingId || saved[result.googleBooksId]) {
      return;
    }

    setSavingId(result.googleBooksId);
    setError(null);

    try {
      const bookId = await createBook({
        googleBooksId: result.googleBooksId,
        title: result.title,
        author: result.author,
        genreTags: result.genreTags,
        moodTags: [],
        sessionId: session?.sessionId ?? undefined,
        coverUrl: result.coverUrl ?? undefined,
      });
      setSaved((current) => ({ ...current, [result.googleBooksId]: bookId }));
      router.push(`/books/${bookId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save book");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="book-title" className="sr-only">
          Search books by title
        </label>
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-white/50" aria-hidden>
            ⌕
          </span>
          <input
            id="book-title"
            type="search"
            name="q"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Search books, authors, or series"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="search"
            className="focus-ring min-h-12 w-full rounded-full border border-transparent bg-[#2a2a2a] py-3 pl-11 pr-4 text-base placeholder:text-white/45 hover:bg-[#333]"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !title.trim()}
          className="spotify-button shrink-0"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {error ? (
        <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm font-medium text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      {searching ? (
        <p className="text-sm font-medium text-white/55" role="status">
          Finding books and their worlds…
        </p>
      ) : null}

      {!searching && searched && results.length === 0 && !error ? (
        <p className="text-sm text-white/55" role="status">
          No books found. Try a title, author, or a shorter search.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Search results">
          {results.map((result) => {
            const isSaving = savingId === result.googleBooksId;
            const isSaved = Boolean(saved[result.googleBooksId]);

            return (
              <li key={result.googleBooksId}>
                <button
                  type="button"
                  onClick={() => onPick(result)}
                  disabled={isSaving || isSaved || savingId !== null}
                  className="focus-ring flex min-h-24 w-full items-center gap-3 rounded-lg bg-[#242424] p-2.5 text-left transition-colors hover:bg-[#303030] active:bg-[#383838] disabled:opacity-70"
                >
                  <Cover title={result.title} url={result.coverUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">
                      {result.title}
                    </span>
                    <span className="block truncate text-sm text-foreground/70">
                      {result.author}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white/75">
                    {isSaved ? "Saved" : isSaving ? "Saving…" : "Add"}
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
        className="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-foreground/10 text-lg font-medium text-foreground/50"
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
      width={64}
      height={96}
      className="h-24 w-16 shrink-0 rounded object-cover"
    />
  );
}
