import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";

export const upsertConnection = internalMutation({
  args: {
    spotifyUserId: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scope: v.string(),
  },
  returns: v.object({
    userId: v.id("users"),
    sessionId: v.id("sessions"),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_spotifyUserId", (q) =>
        q.eq("spotifyUserId", args.spotifyUserId)
      )
      .unique();

    let userId = existing?._id;
    if (userId) {
      await ctx.db.patch(userId, {
        displayName: args.displayName,
        email: args.email,
        imageUrl: args.imageUrl,
      });
    } else {
      userId = await ctx.db.insert("users", {
        spotifyUserId: args.spotifyUserId,
        displayName: args.displayName,
        email: args.email,
        imageUrl: args.imageUrl,
        createdAt: Date.now(),
      });
    }

    const tokens = await ctx.db
      .query("spotifyTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (tokens) {
      await ctx.db.patch(tokens._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        scope: args.scope,
      });
    } else {
      await ctx.db.insert("spotifyTokens", {
        userId,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        scope: args.scope,
      });
    }

    const sessionId = await ctx.db.insert("sessions", {
      userId,
      createdAt: Date.now(),
    });

    return { userId, sessionId };
  },
});

export const getBySession = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      displayName: v.string(),
      accessToken: v.string(),
      refreshToken: v.string(),
      expiresAt: v.number(),
      tokenId: v.id("spotifyTokens"),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return null;
    }

    const user = await ctx.db.get(session.userId);
    const tokens = await ctx.db
      .query("spotifyTokens")
      .withIndex("by_user", (q) => q.eq("userId", session.userId))
      .unique();

    if (!user || !tokens) {
      return null;
    }

    return {
      userId: user._id,
      displayName: user.displayName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      tokenId: tokens._id,
    };
  },
});

export const getByUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      displayName: v.string(),
      accessToken: v.string(),
      refreshToken: v.string(),
      expiresAt: v.number(),
      tokenId: v.id("spotifyTokens"),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const tokens = await ctx.db
      .query("spotifyTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!user || !tokens) {
      return null;
    }

    return {
      userId: user._id,
      displayName: user.displayName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      tokenId: tokens._id,
    };
  },
});

export const patchTokens = internalMutation({
  args: {
    tokenId: v.id("spotifyTokens"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: {
      accessToken: string;
      expiresAt: number;
      refreshToken?: string;
    } = {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
    };
    if (args.refreshToken) {
      patch.refreshToken = args.refreshToken;
    }
    await ctx.db.patch(args.tokenId, patch);
    return null;
  },
});

export const getSessionUser = query({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.object({
      displayName: v.string(),
      imageUrl: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return null;
    }
    const user = await ctx.db.get(session.userId);
    if (!user) {
      return null;
    }
    return {
      displayName: user.displayName,
      imageUrl: user.imageUrl ?? null,
    };
  },
});

export const endSession = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.delete(args.sessionId);
    }
    return null;
  },
});
