"use client";

import { useState } from "react";
import { useAppleMusicAuth } from "./lib/use-apple-music";

export function AppleMusicConnect() {
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
    return (
      <p className="text-sm text-white/60">
        Apple Music keys are not set in Convex, so playlists can’t be created yet.
      </p>
    );
  }

  if (connected) {
    return (
      <p className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black/25 px-4 text-sm font-bold">
        <span className="size-2 rounded-full bg-[#fa243c]" />
        Apple Music connected
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void onConnect()}
        disabled={connecting || !ready}
        className="apple-music-button w-fit"
      >
        {connecting
          ? "Connecting Apple Music…"
          : !ready
            ? "Loading Apple Music…"
            : "Connect Apple Music"}
      </button>
      {prefetchError ? (
        <p className="text-sm font-medium text-red-200" role="alert">
          {prefetchError}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-red-200" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
