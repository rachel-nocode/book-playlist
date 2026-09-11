"use client";

import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { authorizeAppleMusic } from "./lib/musickit";

export function AppleMusicSave({
  bookId,
  sessionId,
  playlistUrl,
}: {
  bookId: Id<"books">;
  sessionId: Id<"sessions">;
  playlistUrl: string | undefined;
}) {
  const configured = useQuery(api.appleMusic.isConfigured);
  const getDeveloperToken = useAction(api.appleMusicActions.getDeveloperToken);
  const createPlaylist = useAction(api.appleMusicActions.buildSoundtrack);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [createdUrl, setCreatedUrl] = useState<string | null>(
    playlistUrl ?? null
  );

  const latestUrl = createdUrl ?? playlistUrl;
  const disabled = saving || configured === false;

  async function onSave() {
    if (disabled) {
      return;
    }
    setSaving(true);
    setError(null);
    setUnmatched([]);
    try {
      const tokenResponse = await getDeveloperToken({
        origin: window.location.origin,
      });
      if (!tokenResponse.configured || !tokenResponse.token) {
        throw new Error(
          "Apple Music is not configured. Add APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY."
        );
      }

      const musicUserToken = await authorizeAppleMusic(tokenResponse.token);
      const result = await createPlaylist({
        sessionId,
        bookId,
        musicUserToken,
        developerToken: tokenResponse.token,
      });
      setCreatedUrl(result.playlistUrl);
      setUnmatched(result.unmatched);
    } catch (err) {
      setError(appleMusicError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={disabled}
          className="apple-music-button"
        >
          {saving
            ? "Creating Apple Music playlist…"
            : latestUrl
              ? "Save a new Apple Music playlist"
              : "Create Apple Music playlist"}
        </button>
        {latestUrl ? (
          <a
            href={latestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="spotify-ghost-button"
          >
            Open in Apple Music
          </a>
        ) : null}
      </div>
      {configured === false ? (
        <p className="text-xs text-white/45">
          Apple Music keys are not set yet, so this stays disabled.
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-lg bg-red-500/15 px-3 py-2 text-sm font-medium text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {unmatched.length > 0 ? (
        <p className="text-xs text-white/50">
          Skipped {unmatched.length} unmatched{" "}
          {unmatched.length === 1 ? "track" : "tracks"}: {unmatched.join("; ")}
        </p>
      ) : null}
    </div>
  );
}

function appleMusicError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "Could not create the Apple Music playlist";
}
