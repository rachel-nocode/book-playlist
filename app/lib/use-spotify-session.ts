"use client";

import { useCallback, useEffect, useState } from "react";
import { Id } from "../../convex/_generated/dataModel";

export type SpotifySession = {
  connected: boolean;
  displayName: string | null;
  sessionId: Id<"sessions"> | null;
};

export function useSpotifySession() {
  const [session, setSession] = useState<SpotifySession | null>(null);

  const reload = useCallback(() => {
    fetch("/api/spotify/session")
      .then((response) => response.json())
      .then((data: SpotifySession) => setSession(data))
      .catch(() =>
        setSession({ connected: false, displayName: null, sessionId: null })
      );
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { session, reload, setSession };
}
