"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { api } from "../convex/_generated/api";
import { useSpotifySession } from "./lib/use-spotify-session";

export function SavedPlaylists() {
  const { session } = useSpotifySession();
  const rows = useQuery(
    api.books.listWithPlaylists,
    session?.sessionId ? { sessionId: session.sessionId } : "skip"
  );

  if (!session?.connected) {
    return null;
  }

  if (rows === undefined) {
    return (
      <p className="text-sm font-medium text-white/55" role="status">
        Loading your library…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/15 px-4 py-7 text-center">
        <p className="text-base font-bold">Your library is waiting.</p>
        <p className="mt-1 text-sm text-white/55">
          Search for a book above to create your first soundtrack.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Your library</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">Made for your books</h2>
        </div>
        <span className="text-sm text-white/45">{rows.length} saved</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map(({ book, playlist }) => (
          <li key={book._id}>
            <Link
              href={`/books/${book._id}`}
              className="focus-ring group flex min-h-28 items-center gap-3 rounded-lg bg-[#242424] p-3 transition-colors hover:bg-[#303030] active:bg-[#383838]"
            >
              <BookArt title={book.title} url={book.coverUrl ?? null} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold">{book.title}</span>
                <span className="mt-0.5 block truncate text-sm text-white/60">{book.author}</span>
                {playlist ? (
                  <span className="mt-2 block text-xs font-semibold text-[#b9f5cd]">
                    {playlist.trackIds.length} tracks · updated{" "}
                    {new Date(playlist.refreshedAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="mt-2 block text-xs font-semibold text-white/45">
                    Building your soundtrack…
                  </span>
                )}
              </span>
              <span className="text-xl text-white/35 transition-transform group-hover:translate-x-0.5 group-hover:text-white" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BookArt({ title, url }: { title: string; url: string | null }) {
  if (!url) {
    return (
      <span className="flex size-16 shrink-0 items-center justify-center rounded bg-gradient-to-br from-[#5d6fba] to-[#202a52] text-xl font-black text-white/85" aria-hidden>
        {title.charAt(0)}
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={64}
      height={64}
      className="size-16 shrink-0 rounded object-cover shadow-lg shadow-black/30"
    />
  );
}
