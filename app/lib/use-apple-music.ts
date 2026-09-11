"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authorizeAppleMusic } from "./musickit";

export async function connectAppleMusicAccount(
  getDeveloperToken: (args: { origin?: string }) => Promise<{
    configured: boolean;
    token: string | null;
  }>
): Promise<{ developerToken: string; musicUserToken: string }> {
  const tokenResponse = await getDeveloperToken({
    origin: window.location.origin,
  });
  if (!tokenResponse.configured || !tokenResponse.token) {
    throw new Error(
      "Apple Music is not configured. Add APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY in Convex."
    );
  }
  const musicUserToken = await authorizeAppleMusic(tokenResponse.token);
  return {
    developerToken: tokenResponse.token,
    musicUserToken,
  };
}

export function useAppleMusicAuth() {
  const configured = useQuery(api.appleMusic.isConfigured);
  const getDeveloperToken = useAction(api.appleMusicActions.getDeveloperToken);

  return {
    configured,
    getDeveloperToken,
    connect: () => connectAppleMusicAccount(getDeveloperToken),
  };
}
