"use client";

import { useSpotifySession } from "./lib/use-spotify-session";

export function SpotifyConnect() {
  const { session, setSession } = useSpotifySession();

  async function logout() {
    await fetch("/api/spotify/logout", { method: "POST" });
    setSession({ connected: false, displayName: null, sessionId: null });
  }

  if (!session) {
    return (
      <p className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black/20 px-4 text-sm font-semibold text-white/70" role="status">
        <span className="size-2 animate-pulse rounded-full bg-[#1ed760]" /> Checking Spotify…
      </p>
    );
  }

  if (session.connected) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black/25 px-4 text-sm font-bold">
          <span className="size-2 rounded-full bg-[#1ed760]" />
          Connected as {session.displayName}
        </p>
        <button
          type="button"
          onClick={logout}
          className="spotify-ghost-button shrink-0"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <a
      href="/api/spotify/login"
      className="spotify-button"
    >
      Connect Spotify
    </a>
  );
}
