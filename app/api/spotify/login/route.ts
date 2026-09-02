import { NextRequest, NextResponse } from "next/server";
import { SPOTIFY_SCOPES, OAUTH_STATE_COOKIE, cookieOptions } from "@/app/lib/spotify";

export async function GET(request: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Spotify is not configured" },
      { status: 500 }
    );
  }

  // Local dev: Spotify loopback callbacks must stay on 127.0.0.1 so the OAuth
  // state cookie matches on callback. Never redirect production traffic to loopback.
  const redirectUrl = new URL(redirectUri);
  const requestHostname = (request.headers.get("host") ?? "").split(":")[0];
  const isLoopbackRedirect =
    redirectUrl.hostname === "127.0.0.1" || redirectUrl.hostname === "localhost";

  if (
    process.env.NODE_ENV !== "production" &&
    isLoopbackRedirect &&
    requestHostname !== redirectUrl.hostname
  ) {
    const target = new URL(request.url);
    target.hostname = redirectUrl.hostname;
    target.protocol = redirectUrl.protocol;
    return NextResponse.redirect(target);
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
  });

  const response = NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    ...cookieOptions,
    maxAge: 600,
  });
  return response;
}
