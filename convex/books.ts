import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { getAddedBy } from "./lib/auth";
import { sanitizeVibeIds } from "./lib/vibes";
import { spotifyTrack, vibeId } from "./lib/validators";

const bookDoc = v.object({
  _id: v.id("books"),
  _creationTime: v.number(),
  googleBooksId: v.string(),
  title: v.string(),
  author: v.string(),
  genreTags: v.array(v.string()),
  moodTags: v.array(v.string()),
  addedBy: v.string(),
  userId: v.optional(v.id("users")),
  coverUrl: v.optional(v.string()),
  createdAt: v.number(),
});

const playlistDoc = v.object({
  _id: v.id("playlists"),
  _creationTime: v.number(),
  bookId: v.id("books"),
  spotifyPlaylistUrl: v.string(),
  trackIds: v.array(v.string()),
  tracks: v.optional(v.array(spotifyTrack)),
  generatedAt: v.number(),
  refreshedAt: v.number(),
  sourceHint: v.optional(v.string()),
});

export const create = mutation({
  args: {
    googleBooksId: v.string(),
    title: v.string(),
    author: v.string(),
    genreTags: v.array(v.string()),
    moodTags: v.array(v.string()),
    sessionId: v.optional(v.id("sessions")),
    coverUrl: v.optional(v.string()),
  },
  returns: v.id("books"),
  handler: async (ctx, args): Promise<Id<"books">> => {
    if (!args.title.trim()) {
      throw new Error("Title is required");
    }

    const userId = await userIdFromSession(ctx, args.sessionId);

    const existing = await ctx.db
      .query("books")
      .withIndex("by_googleBooksId", (q) =>
        q.eq("googleBooksId", args.googleBooksId)
      )
      .first();

    let bookId = existing?._id;
    if (existing && userId && !existing.userId) {
      await ctx.db.patch(existing._id, { userId });
    }
    if (existing && args.coverUrl && !existing.coverUrl) {
      await ctx.db.patch(existing._id, { coverUrl: args.coverUrl });
    }

    if (!bookId) {
      bookId = await ctx.db.insert("books", {
        googleBooksId: args.googleBooksId,
        title: args.title.trim(),
        author: args.author.trim(),
        genreTags: args.genreTags,
        moodTags: args.moodTags,
        addedBy: await getAddedBy(ctx),
        userId,
        coverUrl: args.coverUrl,
        createdAt: Date.now(),
      });
    }

    if (userId) {
      await ctx.scheduler.runAfter(
        0,
        internal.spotifyActions.refreshBookPlaylist,
        { bookId }
      );
    }

    return bookId;
  },
});

export const getWithPlaylist = query({
  args: { bookId: v.id("books") },
  returns: v.union(
    v.object({
      book: bookDoc,
      playlist: v.union(playlistDoc, v.null()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await getBookWithPlaylist(ctx, args.bookId);
  },
});

export const listWithPlaylists = query({
  args: { sessionId: v.id("sessions") },
  returns: v.array(
    v.object({
      book: bookDoc,
      playlist: v.union(playlistDoc, v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return [];
    }

    const books = await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("userId", session.userId))
      .take(100);

    const result: Array<{
      book: Doc<"books">;
      playlist: Doc<"playlists"> | null;
    }> = [];
    for (const book of books) {
      const playlist = await ctx.db
        .query("playlists")
        .withIndex("by_bookId", (q) => q.eq("bookId", book._id))
        .unique();
      result.push({ book, playlist });
    }
    return result;
  },
});

export const getDetail = query({
  args: {
    bookId: v.id("books"),
    sessionId: v.optional(v.id("sessions")),
  },
  returns: v.union(
    v.object({
      book: bookDoc,
      playlist: v.union(playlistDoc, v.null()),
      isOwner: v.boolean(),
      lastManualRefreshAt: v.union(v.number(), v.null()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const result = await getBookWithPlaylist(ctx, args.bookId);
    if (!result) {
      return null;
    }

    let isOwner = false;
    let lastManualRefreshAt: number | null = null;

    if (args.sessionId) {
      const session = await ctx.db.get(args.sessionId);
      if (session && result.book.userId === session.userId) {
        isOwner = true;
        const user = await ctx.db.get(session.userId);
        lastManualRefreshAt = user?.lastManualRefreshAt ?? null;
      }
    }

    return {
      ...result,
      isOwner,
      lastManualRefreshAt,
    };
  },
});

export const setMoodTags = mutation({
  args: {
    sessionId: v.id("sessions"),
    bookId: v.id("books"),
    moodTags: v.array(vibeId),
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

    const moodTags = sanitizeVibeIds(args.moodTags);
    await ctx.db.patch(args.bookId, { moodTags });
    await ctx.scheduler.runAfter(
      0,
      internal.spotifyActions.refreshBookPlaylist,
      { bookId: args.bookId }
    );
    return null;
  },
});

export const persistMoodTags = internalMutation({
  args: {
    bookId: v.id("books"),
    moodTags: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      return null;
    }
    if (book.moodTags.length > 0) {
      return null;
    }
    const moodTags = sanitizeVibeIds(args.moodTags);
    if (moodTags.length === 0) {
      return null;
    }
    await ctx.db.patch(args.bookId, { moodTags });
    return null;
  },
});

export const get = internalQuery({
  args: { bookId: v.id("books") },
  returns: v.union(bookDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.bookId);
  },
});

export const listByUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(bookDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);
  },
});

async function getBookWithPlaylist(ctx: QueryCtx, bookId: Id<"books">) {
  const book = await ctx.db.get(bookId);
  if (!book) {
    return null;
  }

  const playlist = await ctx.db
    .query("playlists")
    .withIndex("by_bookId", (q) => q.eq("bookId", bookId))
    .unique();

  return { book, playlist };
}

async function userIdFromSession(
  ctx: MutationCtx,
  sessionId: Id<"sessions"> | undefined
): Promise<Id<"users"> | undefined> {
  if (!sessionId) {
    return undefined;
  }
  const session = await ctx.db.get(sessionId);
  return session?.userId;
}
