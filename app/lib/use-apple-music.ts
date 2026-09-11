"use client";

import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { authorizeAppleMusic, prefetchMusicKit } from "./musickit";

export function useAppleMusicAuth() {
  const configured = useQuery(api.appleMusic.isConfigured);
  const getDeveloperToken = useAction(api.appleMusicActions.getDeveloperToken);
  const [ready, setReady] = useState(false);
  const [prefetchError, setPrefetchError] = useState<string | null>(null);

  useEffect(() => {
    if (configured !== true) {
      setReady(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const tokenResponse = await getDeveloperToken({
          origin: window.location.origin,
        });
        if (!tokenResponse.configured || !tokenResponse.token) {
          throw new Error(
            "Apple Music is not configured. Add APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY in Convex."
          );
        }
        await prefetchMusicKit(tokenResponse.token);
        if (!cancelled) {
          setReady(true);
          setPrefetchError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setReady(false);
          setPrefetchError(
            err instanceof Error ? err.message : "Apple Music failed to load"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, getDeveloperToken]);

  return {
    configured,
    ready,
    prefetchError,
    connect: async () => {
      const musicUserToken = await authorizeAppleMusic();
      return { musicUserToken };
    },
  };
}
