import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getConvexClient, api } from "@/app/lib/convex-server";
import { SESSION_COOKIE } from "@/app/lib/spotify";
import { Id } from "@/convex/_generated/dataModel";

export async function GET() {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({
      connected: false,
      displayName: null,
      sessionId: null,
    });
  }

  const convex = getConvexClient();
  const user = await convex.query(api.spotify.getSessionUser, {
    sessionId: sessionId as Id<"sessions">,
  });

  if (!user) {
    return NextResponse.json({
      connected: false,
      displayName: null,
      sessionId: null,
    });
  }

  return NextResponse.json({
    connected: true,
    displayName: user.displayName,
    sessionId,
  });
}
