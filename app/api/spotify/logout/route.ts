import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getConvexClient, api } from "@/app/lib/convex-server";
import { SESSION_COOKIE, cookieOptions } from "@/app/lib/spotify";
import { Id } from "@/convex/_generated/dataModel";

export async function POST() {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const convex = getConvexClient();
    await convex.mutation(api.spotify.endSession, {
      sessionId: sessionId as Id<"sessions">,
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
