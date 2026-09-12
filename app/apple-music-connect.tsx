"use client";

import { useState } from "react";
import { useAppleMusicAuth } from "./lib/use-apple-music";

export function AppleMusicConnect({ compact = false }: { compact?: boolean }) {
  const { configured, ready, prefetchError, connect } = useAppleMusicAuth();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConnect() {
    if (connecting || !ready) {
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await connect();
      setConnected(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not connect Apple Music"
      );
    } finally {
      setConnecting(false);
    }
  }

  if (configured === false) {
    if (compact) {
      return (
        <p className="max-w-40 text-right text-[11px] leading-snug text-ink">
          Apple Music keys aren’t set yet
        </p>
      );
    }
    return (
      <p className="text-sm text-ink">
        Apple Music keys are not set in Convex, so playlists can’t be created yet.
      </p>
    );
  }

  if (connected) {
    return (
      <p className="inline-flex min-h-9 items-center gap-2 px-1 text-sm text-foreground/85">
        <span className="size-1.5 rounded-full bg-[#c45c4a]" />
        Apple Music
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void onConnect()}
        disabled={connecting || !ready}
        className={compact ? "ghost-button min-h-9 px-3 text-xs" : "apple-music-button w-fit"}
      >
        {connecting
          ? "Connecting…"
          : !ready
            ? "Loading…"
            : compact
              ? "Apple Music"
              : "Connect Apple Music"}
      </button>
      {prefetchError ? (
        <p className="text-xs font-medium text-[#e7b4a8]" role="alert">
          {prefetchError}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-[#e7b4a8]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
