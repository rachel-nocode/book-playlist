"use client";

import { useMutation, useQuery } from "convex/react";
import { Id } from "../convex/_generated/dataModel";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import { useSpotifySession } from "./lib/use-spotify-session";
import {
  readLocalLibrary,
  removeFromLocalLibrary,
  subscribeLocalLibrary,
} from "./lib/local-library";

type LibraryRow = {
  book: {
    _id: Id<"books">;
    title: string;
    author: string;
    coverUrl?: string;
  };
  playlist: {
    trackIds: string[];
    refreshedAt: number;
    appleMusicPlaylistUrl?: string;
  } | null;
};

export function SavedPlaylists() {
  const { session } = useSpotifySession();
  const removeBook = useMutation(api.books.remove);
  const [removingId, setRemovingId] = useState<Id<"books"> | null>(null);
  const [localIds, setLocalIds] = useState<Id<"books">[]>([]);

  useEffect(() => {
    const sync = () => setLocalIds(readLocalLibrary());
    sync();
    return subscribeLocalLibrary(sync);
  }, []);

  const sessionRows = useQuery(
    api.books.listWithPlaylists,
    session?.sessionId ? { sessionId: session.sessionId } : "skip"
  );
  const localRows = useQuery(
    api.books.listByIds,
    localIds.length > 0 ? { bookIds: localIds } : "skip"
  );

  const rows = useMemo(() => {
    const merged = new Map<Id<"books">, LibraryRow>();
    for (const row of localRows ?? []) {
      merged.set(row.book._id, row);
    }
    for (const row of sessionRows ?? []) {
      merged.set(row.book._id, row);
    }
    return [...merged.values()];
  }, [localRows, sessionRows]);

  async function handleRemove(bookId: Id<"books">) {
    if (removingId) return;
    setRemovingId(bookId);
    try {
      if (session?.sessionId) {
        try {
          await removeBook({ sessionId: session.sessionId, bookId });
        } catch {
          // Apple-only books are stored locally and may have no Spotify owner.
        }
      }
      removeFromLocalLibrary(bookId);
      setLocalIds(readLocalLibrary());
    } finally {
      setRemovingId(null);
    }
  }

  const waitingOnSession = Boolean(session?.sessionId) && sessionRows === undefined;
  const waitingOnLocal = localIds.length > 0 && localRows === undefined;

  if (!session?.connected && localIds.length === 0) {
    return null;
  }

  if (waitingOnSession || waitingOnLocal) {
    return (
      <p className="text-sm text-ink" role="status">
        Opening your shelf…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <section>
        <ShelfHeading count={0} />
        <p className="border-t border-rule/80 pt-6 text-sm text-ink">
          Empty shelf. Search a title and we’ll start stacking.
        </p>
      </section>
    );
  }

  return (
    <section>
      <ShelfHeading count={rows.length} />
      <ul className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
        {rows.map(({ book, playlist }) => (
          <li key={book._id} className="group relative">
            <Link href={`/books/${book._id}`} className="focus-ring block">
              <BookArt title={book.title} url={book.coverUrl ?? null} />
              <span className="mt-2 block font-serif text-sm leading-snug text-foreground">
                {book.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-ink">
                {book.author}
              </span>
              {playlist ? (
                <span className="mt-1 block text-[11px] text-gold">
                  {playlist.trackIds.length} tracks
                </span>
              ) : (
                <span className="mt-1 block text-[11px] text-ink">Scoring…</span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => void handleRemove(book._id)}
              disabled={removingId === book._id}
              aria-label={`Remove ${book.title} from your library`}
              className="focus-ring absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full bg-[#14110e]/90 text-ink opacity-100 transition-colors hover:bg-[#7a2e2e] hover:text-[#f8ece4] md:opacity-0 md:group-hover:opacity-100"
            >
              {removingId === book._id ? (
                <span className="size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShelfHeading({ count }: { count: number }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 border-b border-rule/80 pb-3">
      <h2 className="font-serif text-2xl tracking-tight">My books</h2>
      <span className="text-xs uppercase tracking-[0.16em] text-ink">
        {count} {count === 1 ? "title" : "titles"}
      </span>
    </div>
  );
}

function BookArt({ title, url }: { title: string; url: string | null }) {
  if (!url) {
    return (
      <span
        className="cover-shadow flex aspect-[2/3] w-full items-center justify-center bg-[#261f18] font-serif text-3xl text-gold"
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
      width={160}
      height={240}
      className="cover-shadow aspect-[2/3] w-full object-cover"
    />
  );
}
