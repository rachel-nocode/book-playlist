"use node";

import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mapGenreTagsToMoodFilters } from "./lib/genreMoodMap";
import type { MoodFilters } from "./lib/genreMoodMap";
import {
  buildCatalogQueries,
  isTrailerText,
  scorePlaylistMatch,
  trackVibeScore,
} from "./lib/trackMatch";
import {
  resolveVibeIds,
  resolveVibeOptions,
  vibeLabels,
  type VibeId,
  type VibeOption,
} from "./lib/vibes";
import { moodFilters, spotifyTrack } from "./lib/validators";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";

export const completeOAuth = action({
  args: { code: v.string() },
  returns: v.object({
    sessionId: v.id("sessions"),
    displayName: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ sessionId: Id<"sessions">; displayName: string }> => {
    const { clientId, clientSecret, redirectUri } = spotifyConfig();

    const token = await requestToken({
      clientId,
      clientSecret,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: args.code,
        redirect_uri: redirectUri,
      }),
    });

    if (!token.refreshToken) {
      throw new Error("Spotify did not return a refresh token");
    }

    const profile = await spotifyMe(token.accessToken);
    const connection: { userId: Id<"users">; sessionId: Id<"sessions"> } =
      await ctx.runMutation(internal.spotify.upsertConnection, {
      spotifyUserId: profile.id,
      displayName: profile.displayName,
      email: profile.email,
      imageUrl: profile.imageUrl,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scope: token.scope,
    });

    return {
      sessionId: connection.sessionId,
      displayName: profile.displayName,
    };
  },
});

export const searchTracks = action({
  args: {
    sessionId: v.id("sessions"),
    genreTags: v.array(v.string()),
    title: v.optional(v.string()),
    author: v.optional(v.string()),
    moodTags: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    filters: moodFilters,
    tracks: v.array(spotifyTrack),
    sourceHint: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    filters: MoodFilters;
    tracks: CompiledTrack[];
    sourceHint: string;
  }> => {
    const accessToken = await getValidAccessToken(ctx, args.sessionId);
    const compiled = await compileBookTracks(
      accessToken,
      {
        title: args.title ?? "",
        author: args.author ?? "",
        genreTags: args.genreTags,
        moodTags: args.moodTags ?? [],
      },
      args.limit
    );

    return {
      filters: compiled.filters,
      tracks: compiled.tracks,
      sourceHint: compiled.sourceHint,
    };
  },
});

export const refreshBookPlaylist = internalAction({
  args: { bookId: v.id("books") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const book = await ctx.runQuery(internal.books.get, { bookId: args.bookId });
    if (!book?.userId) {
      return null;
    }

    await refreshBook(ctx, book);
    return null;
  },
});

export const refreshUserPlaylists = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const books = await ctx.runQuery(internal.books.listByUser, {
      userId: args.userId,
    });

    for (const book of books) {
      try {
        await refreshBook(ctx, book);
      } catch (error) {
        console.error("Playlist refresh failed", {
          bookId: book._id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return null;
  },
});

async function refreshBook(
  ctx: ActionCtx,
  book: {
    _id: Id<"books">;
    userId?: Id<"users">;
    title: string;
    author: string;
    genreTags: string[];
    moodTags: string[];
  }
): Promise<void> {
  if (!book.userId) {
    return;
  }

  const accessToken = await getValidAccessTokenForUser(ctx, book.userId);
  const compiled = await compileBookTracks(accessToken, book);

  if (book.moodTags.length === 0 && compiled.moodTags.length > 0) {
    await ctx.runMutation(internal.books.persistMoodTags, {
      bookId: book._id,
      moodTags: compiled.moodTags,
    });
  }

  await ctx.runMutation(internal.playlists.overwriteTracks, {
    bookId: book._id,
    tracks: compiled.tracks,
    sourceHint: compiled.sourceHint,
  });
}

function spotifyConfig() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, or SPOTIFY_REDIRECT_URI"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

async function getValidAccessTokenForUser(
  ctx: ActionCtx,
  userId: Id<"users">
): Promise<string> {
  const connection = await ctx.runQuery(internal.spotify.getByUser, { userId });
  if (!connection) {
    throw new Error("Not connected to Spotify");
  }
  return await refreshIfNeeded(ctx, connection);
}

async function getValidAccessToken(
  ctx: ActionCtx,
  sessionId: Id<"sessions">
): Promise<string> {
  const connection = await ctx.runQuery(internal.spotify.getBySession, {
    sessionId,
  });
  if (!connection) {
    throw new Error("Not connected to Spotify");
  }
  return await refreshIfNeeded(ctx, connection);
}

async function refreshIfNeeded(
  ctx: ActionCtx,
  connection: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenId: Id<"spotifyTokens">;
  }
): Promise<string> {
  if (connection.expiresAt > Date.now() + 60_000) {
    return connection.accessToken;
  }

  const { clientId, clientSecret } = spotifyConfig();
  const token = await requestToken({
    clientId,
    clientSecret,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    }),
  });

  await ctx.runMutation(internal.spotify.patchTokens, {
    tokenId: connection.tokenId,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || undefined,
    expiresAt: token.expiresAt,
  });

  return token.accessToken;
}

async function requestToken(args: {
  clientId: string;
  clientSecret: string;
  body: URLSearchParams;
}) {
  const basic = Buffer.from(`${args.clientId}:${args.clientSecret}`).toString(
    "base64"
  );

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: args.body,
  });

  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(spotifyError(data, "Spotify token request failed"));
  }

  return parseToken(data);
}

function parseToken(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid Spotify token response");
  }
  const record = data as Record<string, unknown>;
  if (typeof record.access_token !== "string") {
    throw new Error("Spotify token response missing access_token");
  }
  if (typeof record.expires_in !== "number") {
    throw new Error("Spotify token response missing expires_in");
  }

  return {
    accessToken: record.access_token,
    refreshToken:
      typeof record.refresh_token === "string" ? record.refresh_token : "",
    expiresAt: Date.now() + record.expires_in * 1000,
    scope: typeof record.scope === "string" ? record.scope : "",
  };
}

async function spotifyMe(accessToken: string) {
  const response = await fetch(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(spotifyError(data, "Failed to load Spotify profile"));
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid Spotify profile");
  }
  const record = data as Record<string, unknown>;
  if (typeof record.id !== "string") {
    throw new Error("Spotify profile missing id");
  }

  const images = Array.isArray(record.images) ? record.images : [];
  const firstImage = images[0];
  const imageUrl =
    typeof firstImage === "object" &&
    firstImage !== null &&
    typeof (firstImage as Record<string, unknown>).url === "string"
      ? ((firstImage as Record<string, unknown>).url as string)
      : undefined;

  return {
    id: record.id,
    displayName:
      typeof record.display_name === "string" && record.display_name.trim()
        ? record.display_name
        : "Spotify user",
    email: typeof record.email === "string" ? record.email : undefined,
    imageUrl,
  };
}

type CompiledTrack = {
  id: string;
  name: string;
  artists: string;
  album: string;
  albumImageUrl: string | null;
  previewUrl: string | null;
  uri: string;
  externalUrl: string;
};

const TARGET_TRACKS = 10;
const MAX_PLAYLISTS = 3;
const TRACKS_PER_PLAYLIST = 30;

async function compileBookTracks(
  accessToken: string,
  book: {
    title: string;
    author: string;
    genreTags: string[];
    moodTags: string[];
  },
  limit?: number
): Promise<{
  filters: MoodFilters;
  tracks: CompiledTrack[];
  sourceHint: string;
  moodTags: VibeId[];
}> {
  const filters = mapGenreTagsToMoodFilters(book.genreTags);
  const vibeIds = resolveVibeIds(book.moodTags, filters.moodTags);
  const vibes = resolveVibeOptions(vibeIds);
  const target = Math.min(Math.max(limit ?? TARGET_TRACKS, 1), TARGET_TRACKS);

  const harvested = await harvestBookPlaylists(
    accessToken,
    book.title,
    book.author
  );
  const catalog = await searchCatalogFill(accessToken, book, vibes, filters);

  const tracks = mergeRankedTracks(
    [
      { tracks: harvested, bonus: 8 },
      { tracks: catalog, bonus: 1 },
    ],
    vibes
  ).slice(0, target);

  return {
    filters,
    tracks,
    sourceHint: sourceHintFor(book.title, vibeIds, harvested.length > 0),
    moodTags: vibeIds,
  };
}

function sourceHintFor(
  title: string,
  vibeIds: VibeId[],
  fromPlaylists: boolean
): string {
  if (fromPlaylists && title.trim()) {
    return `From playlists named ${title.trim()}`;
  }
  const labels = vibeLabels(vibeIds);
  if (labels.length > 0) {
    return `From ${labels.join(" + ")} search`;
  }
  if (title.trim()) {
    return `From “${title.trim()}” search`;
  }
  return "From vibe search";
}

async function harvestBookPlaylists(
  accessToken: string,
  title: string,
  author: string
): Promise<CompiledTrack[]> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return [];
  }

  const queries = [`"${trimmedTitle}"`];
  if (author.trim()) {
    queries.push(`${trimmedTitle} ${author.trim()}`);
  }

  const playlists: Array<{
    id: string;
    name: string;
    description: string;
    score: number;
  }> = [];

  for (const query of queries) {
    const found = await searchPlaylists(accessToken, query, 10);
    for (const playlist of found) {
      const score = scorePlaylistMatch(
        playlist.name,
        playlist.description,
        trimmedTitle,
        author
      );
      if (score > 0) {
        playlists.push({ ...playlist, score });
      }
    }
  }

  const top = dedupePlaylists(playlists)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_PLAYLISTS);

  const tracks: CompiledTrack[] = [];
  for (const playlist of top) {
    const items = await getPlaylistTracks(
      accessToken,
      playlist.id,
      TRACKS_PER_PLAYLIST
    );
    tracks.push(...items);
  }
  return tracks;
}

async function searchCatalogFill(
  accessToken: string,
  book: { title: string; author: string },
  vibes: VibeOption[],
  filters: MoodFilters
): Promise<CompiledTrack[]> {
  const queries = buildCatalogQueries({
    title: book.title,
    author: book.author,
    vibeSearchTerms: vibes.flatMap((vibe) => [...vibe.searchTerms]),
    genreSearchTerms: filters.searchTerms,
  });

  const tracks: CompiledTrack[] = [];
  for (const query of queries) {
    tracks.push(...(await searchCatalog(accessToken, query, TARGET_TRACKS)));
  }
  return tracks;
}

function mergeRankedTracks(
  groups: Array<{ tracks: CompiledTrack[]; bonus: number }>,
  vibes: VibeOption[]
): CompiledTrack[] {
  const byId = new Map<string, CompiledTrack & { score: number }>();

  for (const group of groups) {
    for (const track of group.tracks) {
      if (isTrailerTrack(track)) {
        continue;
      }
      const add =
        group.bonus +
        trackVibeScore(
          `${track.name} ${track.artists} ${track.album}`,
          vibes
        );
      const existing = byId.get(track.id);
      if (existing) {
        existing.score += add;
      } else {
        byId.set(track.id, { ...track, score: add });
      }
    }
  }

  return [...byId.values()]
    .sort((left, right) => right.score - left.score)
    .map((ranked) => ({
      id: ranked.id,
      name: ranked.name,
      artists: ranked.artists,
      album: ranked.album,
      albumImageUrl: ranked.albumImageUrl,
      previewUrl: ranked.previewUrl,
      uri: ranked.uri,
      externalUrl: ranked.externalUrl,
    }));
}

function isTrailerTrack(track: CompiledTrack): boolean {
  return isTrailerText(`${track.name} ${track.artists} ${track.album}`);
}

function dedupePlaylists<T extends { id: string }>(playlists: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const playlist of playlists) {
    if (seen.has(playlist.id)) {
      continue;
    }
    seen.add(playlist.id);
    result.push(playlist);
  }
  return result;
}

async function searchPlaylists(
  accessToken: string,
  query: string,
  limit: number
) {
  const url = new URL(`${API_URL}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("type", "playlist");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(spotifyError(data, "Spotify playlist search failed"));
  }
  return parsePlaylists(data);
}

async function getPlaylistTracks(
  accessToken: string,
  playlistId: string,
  limit: number
) {
  const url = new URL(`${API_URL}/playlists/${playlistId}/tracks`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set(
    "fields",
    "items(track(id,name,artists(name),album(name,images),preview_url,uri,external_urls))"
  );

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(spotifyError(data, "Failed to load playlist tracks"));
  }
  return parsePlaylistTracks(data);
}

function parsePlaylists(data: unknown) {
  if (typeof data !== "object" || data === null || !("playlists" in data)) {
    return [];
  }
  const playlists = (data as { playlists: unknown }).playlists;
  if (
    typeof playlists !== "object" ||
    playlists === null ||
    !("items" in playlists)
  ) {
    return [];
  }
  const items = (playlists as { items: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  const results: Array<{ id: string; name: string; description: string }> = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.name !== "string") {
      continue;
    }
    results.push({
      id: record.id,
      name: record.name,
      description:
        typeof record.description === "string" ? record.description : "",
    });
  }
  return results;
}

function parsePlaylistTracks(data: unknown): CompiledTrack[] {
  if (typeof data !== "object" || data === null || !("items" in data)) {
    return [];
  }
  const items = (data as { items: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  const results: CompiledTrack[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null || !("track" in item)) {
      continue;
    }
    const parsed = parseTrack((item as { track: unknown }).track);
    if (parsed) {
      results.push(parsed);
    }
  }
  return results;
}

async function searchCatalog(
  accessToken: string,
  query: string,
  limit: number
) {
  const url = new URL(`${API_URL}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(spotifyError(data, "Spotify search failed"));
  }

  return parseTracks(data);
}

function parseTracks(data: unknown) {
  if (typeof data !== "object" || data === null || !("tracks" in data)) {
    return [];
  }
  const tracks = (data as { tracks: unknown }).tracks;
  if (typeof tracks !== "object" || tracks === null || !("items" in tracks)) {
    return [];
  }
  const items = (tracks as { items: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  const results: Array<{
    id: string;
    name: string;
    artists: string;
    album: string;
    albumImageUrl: string | null;
    previewUrl: string | null;
    uri: string;
    externalUrl: string;
  }> = [];

  for (const item of items) {
    const parsed = parseTrack(item);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

function parseTrack(item: unknown) {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const record = item as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.uri !== "string"
  ) {
    return null;
  }

  const artists = Array.isArray(record.artists)
    ? record.artists
        .map((artist) =>
          typeof artist === "object" &&
          artist !== null &&
          typeof (artist as Record<string, unknown>).name === "string"
            ? ((artist as Record<string, unknown>).name as string)
            : null
        )
        .filter((name): name is string => name !== null)
    : [];

  const album =
    typeof record.album === "object" && record.album !== null
      ? (record.album as Record<string, unknown>)
      : null;
  const albumName = typeof album?.name === "string" ? album.name : "Unknown album";
  const images = Array.isArray(album?.images) ? album.images : [];
  const image = images[0];
  const albumImageUrl =
    typeof image === "object" &&
    image !== null &&
    typeof (image as Record<string, unknown>).url === "string"
      ? ((image as Record<string, unknown>).url as string)
      : null;

  const external =
    typeof record.external_urls === "object" && record.external_urls !== null
      ? (record.external_urls as Record<string, unknown>)
      : null;

  return {
    id: record.id,
    name: record.name,
    artists: artists.join(", ") || "Unknown artist",
    album: albumName,
    albumImageUrl,
    previewUrl: typeof record.preview_url === "string" ? record.preview_url : null,
    uri: record.uri,
    externalUrl:
      typeof external?.spotify === "string"
        ? external.spotify
        : `https://open.spotify.com/track/${record.id}`,
  };
}

function spotifyError(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    if (typeof record.error_description === "string") {
      return record.error_description;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
    if (typeof record.error === "object" && record.error !== null) {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === "string") {
        return nested.message;
      }
    }
  }
  return fallback;
}
