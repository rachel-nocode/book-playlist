"use client";

import { useSpotifySession } from "./lib/use-spotify-session";

export function SpotifyConnect({ compact = false }: { compact?: boolean }) {
  const { session, setSession } = useSpotifySession();

  async function logout() {
    await fetch("/api/spotify/logout", { method: "POST" });
    setSession({ connected: false, displayName: null, sessionId: null });
  }

  if (!session) {
    return (
      <p className="text-xs text-ink" role="status">
        Checking Spotify…
      </p>
    );
  }

  if (session.connected) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="text-xs text-ink sm:text-sm">
          {session.displayName}
        </p>
        <button
          type="button"
          onClick={logout}
          className="ghost-button min-h-9 px-3 text-xs"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <a
      href="/api/spotify/login"
      className={compact ? "ghost-button min-h-9 px-3 text-xs" : "gold-button"}
    >
      {compact ? "Spotify" : "Connect Spotify"}
    </a>
  );
}
