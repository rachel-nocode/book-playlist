"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useSpotifySession } from "../../lib/use-spotify-session";
import { generatedAgoLabel, HOUR_MS } from "../../lib/time";
import { mapGenreTagsToMoodFilters } from "../../../convex/lib/genreMoodMap";
import {
  inferVibeIds,
  VIBE_OPTIONS,
  type VibeId,
} from "../../../convex/lib/vibes";

export function BookDetail({ bookId }: { bookId: Id<"books"> }) {
  const { session } = useSpotifySession();
  const requestRefresh = useMutation(api.playlists.requestRefresh);
  const setMoodTags = useMutation(api.books.setMoodTags);
  const detail = useQuery(api.books.getDetail, {
    bookId,
    sessionId: session?.sessionId ?? undefined,
  });

  const [now] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [updatingVibe, setUpdatingVibe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (detail === undefined) {
    return (
      <p className="text-base text-foreground/70" role="status">
        Loading…
      </p>
    );
  }

  if (detail === null) {
    return (
      <p className="text-base text-foreground/70" role="status">
        Book not found.
      </p>
    );
  }

  const { book, playlist, isOwner, lastManualRefreshAt } = detail;
  const tracks = playlist?.tracks ?? [];
  const generatedAt = playlist?.refreshedAt ?? playlist?.generatedAt;
  const inferredVibes = inferVibeIds(
    mapGenreTagsToMoodFilters(book.genreTags).moodTags
  );
  const selectedVibes =
    book.moodTags.length > 0
      ? book.moodTags.filter((tag): tag is VibeId =>
          VIBE_OPTIONS.some((option) => option.id === tag)
        )
      : inferredVibes;
  const canRefresh =
    isOwner &&
    Boolean(session?.sessionId) &&
    (lastManualRefreshAt === null || now - lastManualRefreshAt >= HOUR_MS);

  async function onToggleVibe(vibeId: VibeId) {
    if (!session?.sessionId || !isOwner || updatingVibe) {
      return;
    }
    const next = toggleVibe(selectedVibes, vibeId);
    setUpdatingVibe(true);
    setError(null);
    try {
      await setMoodTags({
        sessionId: session.sessionId,
        bookId,
        moodTags: next,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update vibe");
    } finally {
      setUpdatingVibe(false);
    }
  }

  async function onRefresh() {
    if (!session?.sessionId || refreshing || !canRefresh) {
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      await requestRefresh({ sessionId: session.sessionId, bookId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="focus-ring inline-flex w-fit min-h-10 items-center rounded-full px-3 text-sm font-bold text-white/65 transition-colors hover:bg-white/10 hover:text-white">
        ← Back to library
      </Link>

      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#586e65] via-[#283a34] to-[#181818] p-5 sm:p-7">
        <div className="absolute -right-12 -top-20 size-52 rounded-full bg-[#1ed760]/15 blur-3xl" />
        <div className="relative flex gap-4 sm:gap-6">
        <Cover title={book.title} url={book.coverUrl ?? null} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b9f5cd]">Book soundtrack</p>
          <h1 className="mt-2 text-balance text-3xl font-black tracking-tight sm:text-4xl">
            {book.title}
          </h1>
          <p className="mt-2 text-base text-white/70">{book.author}</p>
          {generatedAt ? (
            <p className="mt-4 text-sm font-medium text-white/65">
              {generatedAgoLabel(generatedAt, now)}
            </p>
          ) : (
            <p className="mt-4 text-sm font-medium text-white/65">Building your soundtrack…</p>
          )}
        </div>
      </div>
      </div>

      {isOwner ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={!canRefresh || refreshing}
          className="spotify-button w-fit"
        >
          {refreshing
            ? "Refreshing…"
            : canRefresh
              ? "Refresh now"
              : "Refresh available in 1 hour"}
        </button>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm font-medium text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      <section aria-label="Playlist vibe">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">
          Vibe
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VIBE_OPTIONS.map((option) => {
            const selected = selectedVibes.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                disabled={!isOwner || updatingVibe || !session?.sessionId}
                onClick={() => onToggleVibe(option.id)}
                className={`focus-ring min-h-9 rounded-full px-3.5 text-sm font-bold transition-colors ${
                  selected
                    ? "bg-[#1ed760] text-black"
                    : "bg-white/10 text-white/80 hover:bg-white/15"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {isOwner ? (
          <p className="mt-2 text-xs text-white/45">
            Pick up to two. Changing vibe rebuilds the soundtrack.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl bg-[#121212] p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Generated playlist</p>
            <h2 className="mt-1 text-2xl font-black">Playlist</h2>
            {playlist?.sourceHint ? (
              <p className="mt-1 text-sm text-white/50">{playlist.sourceHint}</p>
            ) : null}
          </div>
          {tracks.length > 0 ? <span className="text-sm font-semibold text-[#b9f5cd]">{tracks.length} tracks</span> : null}
        </div>
        {updatingVibe ? (
          <p className="mt-4 text-sm font-medium text-white/55" role="status">
            Updating soundtrack…
          </p>
        ) : null}
        {tracks.length === 0 ? (
          <p className="mt-4 rounded-lg bg-white/5 px-4 py-5 text-sm text-white/60">
            {playlist
              ? "No matching playlists yet. Try a different vibe."
              : "Building a soundtrack from this book’s world…"}
          </p>
        ) : (
          <ol className="mt-4 flex flex-col gap-1">
            {tracks.map((track, index) => (
              <li key={track.id}>
                <a
                  href={track.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring group flex min-h-14 items-center gap-3 rounded-md p-2 transition-colors hover:bg-white/10 active:bg-white/15"
                >
                  <TrackArt name={track.name} url={track.albumImageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold">
                      <span className="mr-2 inline-block w-5 text-sm font-medium text-white/40">{index + 1}</span>{track.name}
                    </span>
                    <span className="block truncate pl-7 text-sm text-white/55">
                      {track.artists}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function toggleVibe(current: VibeId[], vibeId: VibeId): VibeId[] {
  if (current.includes(vibeId)) {
    return current.filter((id) => id !== vibeId);
  }
  if (current.length < 2) {
    return [...current, vibeId];
  }
  const [, ...rest] = current;
  return [...rest, vibeId];
}

function Cover({ title, url }: { title: string; url: string | null }) {
  if (!url) {
    return (
      <span
        className="flex h-36 w-24 shrink-0 items-center justify-center rounded bg-foreground/10 text-2xl font-medium text-foreground/50"
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
      width={96}
      height={144}
      className="h-36 w-24 shrink-0 rounded object-cover"
      priority
    />
  );
}

function TrackArt({ name, url }: { name: string; url: string | null }) {
  if (!url) {
    return (
      <span
        className="flex size-12 shrink-0 items-center justify-center rounded bg-foreground/10 text-sm text-foreground/50"
        aria-hidden
      >
        {name.charAt(0)}
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={48}
      height={48}
      className="size-12 shrink-0 rounded object-cover"
    />
  );
}
