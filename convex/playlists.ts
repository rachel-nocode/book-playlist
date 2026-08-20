import { internalMutation, mutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { spotifyTrack } from "./lib/validators";

const HOUR_MS = 60 * 60 * 1000;

export const overwriteTracks = internalMutation({
  args: {
    bookId: v.id("books"),
    tracks: v.array(spotifyTrack),
  },
  returns: v.id("playlists"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("playlists")
      .withIndex("by_bookId", (q) => q.eq("bookId", args.bookId))
      .unique();

    const refreshedAt = Date.now();
    const trackIds = args.tracks.map((track) => track.id);

    if (existing) {
      await ctx.db.patch(existing._id, {
        trackIds,
        tracks: args.tracks,
        refreshedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("playlists", {
      bookId: args.bookId,
      spotifyPlaylistUrl: "",
      trackIds,
      tracks: args.tracks,
      generatedAt: refreshedAt,
      refreshedAt,
    });
  },
});

export const requestRefresh = mutation({
  args: {
    sessionId: v.id("sessions"),
    bookId: v.id("books"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Not connected to Spotify");
    }

    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }
    if (book.userId !== session.userId) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db.get(session.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const now = Date.now();
    if (
      user.lastManualRefreshAt !== undefined &&
      now - user.lastManualRefreshAt < HOUR_MS
    ) {
      throw new Error("You can refresh once per hour");
    }

    await ctx.db.patch(user._id, { lastManualRefreshAt: now });
    await ctx.scheduler.runAfter(
      0,
      internal.spotifyActions.refreshBookPlaylist,
      { bookId: args.bookId }
    );
    return null;
  },
});

export const kickoffDailyRefresh = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userIds = await collectUserIdsWithBooks(ctx);
    let delayMs = 0;

    for (const userId of userIds) {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.spotifyActions.refreshUserPlaylists,
        { userId }
      );
      delayMs += 2000;
    }

    return null;
  },
});

async function collectUserIdsWithBooks(
  ctx: MutationCtx
): Promise<Array<Id<"users">>> {
  const userIds = new Set<Id<"users">>();
  let cursor: string | null = null;

  while (true) {
    const page = await ctx.db
      .query("books")
      .withIndex("by_user")
      .paginate({ numItems: 100, cursor });

    for (const book of page.page) {
      if (book.userId) {
        userIds.add(book.userId);
      }
    }

    if (page.isDone) {
      break;
    }
    cursor = page.continueCursor;
  }

  return [...userIds];
}
