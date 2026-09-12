"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useSpotifySession } from "../../lib/use-spotify-session";
import { generatedAgoLabel, HOUR_MS } from "../../lib/time";
import { AppleMusicSave } from "../../apple-music-save";
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
      <p className="text-base text-ink" role="status">
        Loading…
      </p>
    );
  }

  if (detail === null) {
    return (
      <p className="text-base text-ink" role="status">
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
  const showOwnerControls = isOwner && Boolean(session?.sessionId);
  const canCreateApplePlaylist = isOwner || !book.userId;
  const showAppleMusic =
    canCreateApplePlaylist || Boolean(playlist?.appleMusicPlaylistUrl);

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
    <div className="flex flex-col gap-10">
      <Link
        href="/"
        className="focus-ring w-fit text-sm text-ink transition-colors hover:text-gold"
      >
        ← My books
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
        <Cover title={book.title} url={book.coverUrl ?? null} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
            Soundtrack
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            {book.title}
          </h1>
          <p className="mt-3 text-lg text-ink">{book.author}</p>
          {generatedAt ? (
            <p className="mt-4 text-sm text-ink">
              {generatedAgoLabel(generatedAt, now)}
            </p>
          ) : (
            <p className="mt-4 text-sm text-ink">Scoring the soundtrack…</p>
          )}

          {showOwnerControls || showAppleMusic ? (
            <div className="mt-6 flex flex-col gap-3">
              {showOwnerControls ? (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={!canRefresh || refreshing}
                  className="gold-button w-fit"
                >
                  {refreshing
                    ? "Refreshing…"
                    : canRefresh
                      ? "Refresh soundtrack"
                      : "Refresh available in 1 hour"}
                </button>
              ) : null}
              {showAppleMusic ? (
                <AppleMusicSave
                  bookId={bookId}
                  sessionId={session?.sessionId ?? undefined}
                  playlistUrl={playlist?.appleMusicPlaylistUrl}
                  allowCreate={canCreateApplePlaylist}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-sm border border-[#7a2e2e]/50 bg-[#7a2e2e]/15 px-3 py-2 text-sm text-[#e7b4a8]" role="alert">
          {error}
        </p>
      ) : null}

      <section aria-label="Playlist vibe">
        <h2 className="font-serif text-xl">Vibe</h2>
        <p className="mt-1 text-sm text-ink">
          {isOwner
            ? "Pick up to two. Changing vibe rebuilds the soundtrack."
            : "The mood this playlist is chasing."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {VIBE_OPTIONS.map((option) => {
            const selected = selectedVibes.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                disabled={!isOwner || updatingVibe || !session?.sessionId}
                onClick={() => onToggleVibe(option.id)}
                className={`focus-ring min-h-9 rounded-sm border px-3 text-sm transition-colors ${
                  selected
                    ? "border-gold bg-gold text-[#1a140e]"
                    : "border-rule text-foreground/85 hover:border-gold/50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-3 border-b border-rule/80 pb-3">
          <div>
            <h2 className="font-serif text-2xl">The playlist</h2>
            {playlist?.sourceHint ? (
              <p className="mt-1 text-sm text-ink">{playlist.sourceHint}</p>
            ) : null}
          </div>
          {tracks.length > 0 ? (
            <span className="text-xs uppercase tracking-[0.16em] text-ink">
              {tracks.length} tracks
            </span>
          ) : null}
        </div>
        {updatingVibe ? (
          <p className="mt-4 text-sm text-ink" role="status">
            Rebuilding from the new vibe…
          </p>
        ) : null}
        {tracks.length === 0 ? (
          <p className="mt-6 text-sm text-ink">
            {playlist
              ? "No matching tracks yet. Try a different vibe."
              : "Building a soundtrack from this book’s world…"}
          </p>
        ) : (
          <ol className="mt-2 divide-y divide-rule/70">
            {tracks.map((track, index) => (
              <li key={track.id}>
                <a
                  href={track.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring group flex min-h-14 items-center gap-3 py-3 transition-colors hover:bg-[#1d1813]"
                >
                  <TrackArt name={track.name} url={track.albumImageUrl} />
                  <span className="w-6 shrink-0 text-sm text-ink">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {track.name}
                    </span>
                    <span className="block truncate text-sm text-ink">
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
        className="cover-shadow flex h-52 w-36 shrink-0 items-center justify-center bg-[#261f18] font-serif text-4xl text-gold sm:h-64 sm:w-44"
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
      width={176}
      height={256}
      className="cover-shadow h-52 w-36 shrink-0 object-cover sm:h-64 sm:w-44"
      priority
    />
  );
}

function TrackArt({ name, url }: { name: string; url: string | null }) {
  if (!url) {
    return (
      <span
        className="flex size-11 shrink-0 items-center justify-center bg-[#261f18] text-sm text-gold"
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
      width={44}
      height={44}
      className="size-11 shrink-0 object-cover"
    />
  );
}
