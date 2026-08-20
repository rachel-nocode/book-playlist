import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    spotifyUserId: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    lastManualRefreshAt: v.optional(v.number()),
  }).index("by_spotifyUserId", ["spotifyUserId"]),

  spotifyTokens: defineTable({
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scope: v.string(),
  }).index("by_user", ["userId"]),

  sessions: defineTable({
    userId: v.id("users"),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  books: defineTable({
    googleBooksId: v.string(),
    title: v.string(),
    author: v.string(),
    genreTags: v.array(v.string()),
    moodTags: v.array(v.string()),
    addedBy: v.string(),
    userId: v.optional(v.id("users")),
    coverUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_googleBooksId", ["googleBooksId"])
    .index("by_addedBy", ["addedBy"])
    .index("by_user", ["userId"]),

  playlists: defineTable({
    bookId: v.id("books"),
    spotifyPlaylistUrl: v.string(),
    trackIds: v.array(v.string()),
    tracks: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          artists: v.string(),
          album: v.string(),
          albumImageUrl: v.union(v.string(), v.null()),
          previewUrl: v.union(v.string(), v.null()),
          uri: v.string(),
          externalUrl: v.string(),
        })
      )
    ),
    generatedAt: v.number(),
    refreshedAt: v.number(),
  }).index("by_bookId", ["bookId"]),
});
