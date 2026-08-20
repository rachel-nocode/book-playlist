import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getConvexClient, api } from "@/app/lib/convex-server";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
} from "@/app/lib/spotify";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(new URL(`/?spotify=${error}`, origin));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = cookies().get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/?spotify=invalid_state", origin));
  }

  try {
    const convex = getConvexClient();
    const result = await convex.action(api.spotifyActions.completeOAuth, {
      code,
    });

    const response = NextResponse.redirect(new URL("/?spotify=connected", origin));
    response.cookies.set(OAUTH_STATE_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    response.cookies.set(SESSION_COOKIE, result.sessionId, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?spotify=token_error", origin));
  }
}
