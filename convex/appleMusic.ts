import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { spotifyTrack } from "./lib/validators";
import { appleMusicConfigured } from "./lib/appleMusicConfig";

export const isConfigured = query({
  args: {},
  returns: v.boolean(),
  handler: async () => {
    return appleMusicConfigured();
  },
});

export const getExportContext = internalQuery({
  args: {
    sessionId: v.id("sessions"),
    bookId: v.id("books"),
  },
  returns: v.object({
    bookTitle: v.string(),
    author: v.string(),
    tracks: v.array(spotifyTrack),
    trackIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
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

    const playlist = await ctx.db
      .query("playlists")
      .withIndex("by_bookId", (q) => q.eq("bookId", args.bookId))
      .unique();
    if (!playlist?.tracks || playlist.tracks.length === 0) {
      throw new Error("No generated tracks to save");
    }

    return {
      bookTitle: book.title,
      author: book.author,
      tracks: playlist.tracks,
      trackIds: playlist.trackIds,
    };
  },
});

export const saveLibraryPlaylist = internalMutation({
  args: {
    bookId: v.id("books"),
    playlistId: v.string(),
    playlistUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const playlist = await ctx.db
      .query("playlists")
      .withIndex("by_bookId", (q) => q.eq("bookId", args.bookId))
      .unique();
    if (!playlist) {
      throw new Error("Playlist not found");
    }

    await ctx.db.patch(playlist._id, {
      appleMusicPlaylistId: args.playlistId,
      appleMusicPlaylistUrl: args.playlistUrl,
      appleMusicCreatedAt: Date.now(),
    });
    return null;
  },
});
