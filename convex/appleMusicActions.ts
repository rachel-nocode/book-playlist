"use node";

import { SignJWT, importPKCS8 } from "jose";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  firstArtistName,
  pickBestAppleSong,
  type AppleSongCandidate,
} from "./lib/appleMusicMatch";
import { appleMusicConfigured } from "./lib/appleMusicConfig";

const APPLE_API = "https://api.music.apple.com/v1";
const SPOTIFY_API = "https://api.spotify.com/v1";

const createResult = v.object({
  playlistId: v.string(),
  playlistUrl: v.string(),
  matchedCount: v.number(),
  unmatched: v.array(v.string()),
});

export const getDeveloperToken = action({
  args: {
    origin: v.optional(v.string()),
  },
  returns: v.object({
    configured: v.boolean(),
    token: v.union(v.string(), v.null()),
  }),
  handler: async (_ctx, args) => {
    if (!appleMusicConfigured()) {
      return { configured: false, token: null };
    }
    const origin = sanitizeOrigin(args.origin);
    const token = await signDeveloperToken(origin);
    return { configured: true, token };
  },
});

export const createLibraryPlaylist = action({
  args: {
    sessionId: v.id("sessions"),
    bookId: v.id("books"),
    musicUserToken: v.string(),
    developerToken: v.optional(v.string()),
  },
  returns: createResult,
  handler: async (ctx, args) => {
    if (!appleMusicConfigured()) {
      throw new Error(
        "Apple Music is not configured. Set APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY."
      );
    }
    if (!args.musicUserToken.trim()) {
      throw new Error("Connect Apple Music first");
    }

    const book = await ctx.runQuery(internal.appleMusic.getExportContext, {
      sessionId: args.sessionId,
      bookId: args.bookId,
    });

    const developerToken =
      usableDeveloperToken(args.developerToken) ??
      (await signDeveloperToken());
    const storefront = await getStorefront(
      developerToken,
      args.musicUserToken
    );
    const isrcs = await getSpotifyIsrcs(ctx, args.sessionId, book.trackIds);

    const matched: AppleSongCandidate[] = [];
    const unmatched: string[] = [];
    const seen = new Set<string>();

    for (const track of book.tracks) {
      const isrc = isrcs.get(track.id);
      const song = await findAppleSong(
        developerToken,
        storefront,
        track,
        isrc
      );
      if (!song || seen.has(song.id)) {
        if (!song) {
          unmatched.push(`${track.name} — ${track.artists}`);
        }
        continue;
      }
      seen.add(song.id);
      matched.push(song);
    }

    if (matched.length === 0) {
      throw new Error("None of these tracks were found on Apple Music");
    }

    const created = await createApplePlaylist(
      developerToken,
      args.musicUserToken,
      {
        name: playlistName(book.bookTitle),
        description: `Book Playlist soundtrack for ${book.bookTitle} by ${book.author}`,
        songs: matched,
      }
    );

    await ctx.runMutation(internal.appleMusic.saveLibraryPlaylist, {
      bookId: args.bookId,
      playlistId: created.id,
      playlistUrl: created.url,
    });

    return {
      playlistId: created.id,
      playlistUrl: created.url,
      matchedCount: matched.length,
      unmatched,
    };
  },
});

function playlistName(title: string): string {
  const trimmed = title.trim() || "Book soundtrack";
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function sanitizeOrigin(origin: string | undefined): string | undefined {
  if (!origin) {
    return undefined;
  }
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function usableDeveloperToken(token: string | undefined): string | undefined {
  if (!token) {
    return undefined;
  }
  const parts = token.split(".");
  return parts.length === 3 ? token : undefined;
}

async function signDeveloperToken(origin?: string): Promise<string> {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKey) {
    throw new Error("Apple Music is not configured");
  }

  const key = await importPKCS8(normalizePrivateKey(privateKey), "ES256");
  const claims: Record<string, string> = {};
  if (origin) {
    claims.origin = origin;
  }

  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key);
}

function normalizePrivateKey(value: string): string {
  const unescaped = value.replace(/\\n/g, "\n").trim();
  if (unescaped.includes("BEGIN PRIVATE KEY")) {
    return unescaped;
  }
  return `-----BEGIN PRIVATE KEY-----\n${unescaped}\n-----END PRIVATE KEY-----`;
}

async function getStorefront(
  developerToken: string,
  musicUserToken: string
): Promise<string> {
  const fallback = process.env.APPLE_MUSIC_STOREFRONT?.trim() || "us";
  const response = await appleFetch(
    `${APPLE_API}/me/storefront`,
    developerToken,
    musicUserToken
  );
  if (!response.ok) {
    return fallback;
  }
  const data: unknown = await response.json();
  const id = firstResourceId(data);
  return id || fallback;
}

async function findAppleSong(
  developerToken: string,
  storefront: string,
  track: {
    name: string;
    artists: string;
    album: string;
  },
  isrc: string | undefined
): Promise<AppleSongCandidate | null> {
  if (isrc) {
    const byIsrc = await searchSongsByIsrc(
      developerToken,
      storefront,
      isrc
    );
    const picked = pickBestAppleSong(track.name, track.artists, byIsrc);
    if (picked) {
      return picked;
    }
    if (byIsrc[0]) {
      return byIsrc[0];
    }
  }

  const query = `${track.name} ${firstArtistName(track.artists)}`.trim();
  const searched = await searchSongs(developerToken, storefront, query);
  return pickBestAppleSong(track.name, track.artists, searched);
}

async function searchSongsByIsrc(
  developerToken: string,
  storefront: string,
  isrc: string
): Promise<AppleSongCandidate[]> {
  const url = new URL(`${APPLE_API}/catalog/${storefront}/songs`);
  url.searchParams.set("filter[isrc]", isrc);
  const response = await appleFetch(url.toString(), developerToken);
  if (!response.ok) {
    return [];
  }
  const data: unknown = await response.json();
  return parseSongList(data);
}

async function searchSongs(
  developerToken: string,
  storefront: string,
  term: string
): Promise<AppleSongCandidate[]> {
  const url = new URL(`${APPLE_API}/catalog/${storefront}/search`);
  url.searchParams.set("term", term);
  url.searchParams.set("types", "songs");
  url.searchParams.set("limit", "5");
  const response = await appleFetch(url.toString(), developerToken);
  if (!response.ok) {
    return [];
  }
  const data: unknown = await response.json();
  return parseSearchSongs(data);
}

async function createApplePlaylist(
  developerToken: string,
  musicUserToken: string,
  args: {
    name: string;
    description: string;
    songs: AppleSongCandidate[];
  }
): Promise<{ id: string; url: string }> {
  const created = await postLibraryPlaylist(developerToken, musicUserToken, {
    attributes: {
      name: args.name,
      description: args.description,
    },
  });
  if (!created) {
    throw new Error("Apple Music could not create the playlist");
  }

  const addResponse = await appleFetch(
    `${APPLE_API}/me/library/playlists/${encodeURIComponent(created.id)}/tracks`,
    developerToken,
    musicUserToken,
    {
      method: "POST",
      body: JSON.stringify({
        data: args.songs.map((song) => ({
          id: song.id,
          type: "songs" as const,
        })),
      }),
    }
  );
  if (!addResponse.ok) {
    const data: unknown = await addResponse.json().catch(() => null);
    throw new Error(appleError(data, "Could not add tracks to Apple Music"));
  }

  return created;
}

async function postLibraryPlaylist(
  developerToken: string,
  musicUserToken: string,
  body: Record<string, unknown>
): Promise<{ id: string; url: string } | null> {
  const response = await appleFetch(
    `${APPLE_API}/me/library/playlists`,
    developerToken,
    musicUserToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(appleError(data, appleStatusMessage(response.status)));
  }
  const id = firstResourceId(data);
  if (!id) {
    return null;
  }
  return {
    id,
    url: libraryPlaylistUrl(id, firstResourceUrl(data)),
  };
}

function libraryPlaylistUrl(id: string, apiUrl: string | undefined): string {
  if (apiUrl) {
    return apiUrl;
  }
  return `https://music.apple.com/library/playlist/${id}`;
}

async function appleFetch(
  url: string,
  developerToken: string,
  musicUserToken?: string,
  init?: { method?: string; body?: string }
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${developerToken}`,
    Accept: "application/json",
  };
  if (musicUserToken) {
    headers["Music-User-Token"] = musicUserToken;
  }
  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }
  return await fetch(url, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body,
  });
}

function appleStatusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "Apple Music authorization failed. Use a subscribed Apple Music account.";
  }
  return "Apple Music request failed";
}

async function getSpotifyIsrcs(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  trackIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (trackIds.length === 0) {
    return result;
  }

  try {
    const connection = await ctx.runQuery(internal.spotify.getBySession, {
      sessionId,
    });
    if (!connection) {
      return result;
    }
    const accessToken = await refreshSpotifyIfNeeded(ctx, connection);
    const ids = trackIds.slice(0, 50).join(",");
    const response = await fetch(`${SPOTIFY_API}/tracks?ids=${ids}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      return result;
    }
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("tracks" in data)) {
      return result;
    }
    const tracks = (data as { tracks: unknown }).tracks;
    if (!Array.isArray(tracks)) {
      return result;
    }
    for (const item of tracks) {
      if (typeof item !== "object" || item === null) {
        continue;
      }
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string") {
        continue;
      }
      const external =
        typeof record.external_ids === "object" &&
        record.external_ids !== null
          ? (record.external_ids as Record<string, unknown>)
          : null;
      if (typeof external?.isrc === "string" && external.isrc.trim()) {
        result.set(record.id, external.isrc);
      }
    }
  } catch {
    return result;
  }

  return result;
}

async function refreshSpotifyIfNeeded(
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

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return connection.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    }),
  });
  const data: unknown = await response.json();
  if (
    !response.ok ||
    typeof data !== "object" ||
    data === null ||
    typeof (data as Record<string, unknown>).access_token !== "string"
  ) {
    return connection.accessToken;
  }
  const record = data as Record<string, unknown>;
  const accessToken = record.access_token as string;
  const expiresIn =
    typeof record.expires_in === "number" ? record.expires_in : 3600;
  const refreshToken =
    typeof record.refresh_token === "string"
      ? record.refresh_token
      : undefined;

  await ctx.runMutation(internal.spotify.patchTokens, {
    tokenId: connection.tokenId,
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return accessToken;
}

function firstResourceId(data: unknown): string | undefined {
  const resource = firstResource(data);
  return typeof resource?.id === "string" ? resource.id : undefined;
}

function firstResourceUrl(data: unknown): string | undefined {
  const resource = firstResource(data);
  const attributes =
    typeof resource?.attributes === "object" && resource.attributes !== null
      ? (resource.attributes as Record<string, unknown>)
      : null;
  return typeof attributes?.url === "string" ? attributes.url : undefined;
}

function firstResource(
  data: unknown
): { id?: unknown; attributes?: unknown } | null {
  if (typeof data !== "object" || data === null || !("data" in data)) {
    return null;
  }
  const list = (data as { data: unknown }).data;
  const first = Array.isArray(list) ? list[0] : list;
  if (typeof first !== "object" || first === null) {
    return null;
  }
  return first as { id?: unknown; attributes?: unknown };
}

function parseSearchSongs(data: unknown): AppleSongCandidate[] {
  if (typeof data !== "object" || data === null || !("results" in data)) {
    return [];
  }
  const results = (data as { results: unknown }).results;
  if (typeof results !== "object" || results === null || !("songs" in results)) {
    return [];
  }
  return parseSongList((results as { songs: unknown }).songs);
}

function parseSongList(data: unknown): AppleSongCandidate[] {
  if (typeof data !== "object" || data === null || !("data" in data)) {
    return [];
  }
  const items = (data as { data: unknown }).data;
  if (!Array.isArray(items)) {
    return [];
  }

  const songs: AppleSongCandidate[] = [];
  for (const item of items) {
    const parsed = parseSong(item);
    if (parsed) {
      songs.push(parsed);
    }
  }
  return songs;
}

function parseSong(item: unknown): AppleSongCandidate | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const record = item as Record<string, unknown>;
  if (typeof record.id !== "string") {
    return null;
  }
  const attributes =
    typeof record.attributes === "object" && record.attributes !== null
      ? (record.attributes as Record<string, unknown>)
      : null;
  const name = typeof attributes?.name === "string" ? attributes.name : "";
  if (!name) {
    return null;
  }
  return {
    id: record.id,
    name,
    artistName:
      typeof attributes?.artistName === "string"
        ? attributes.artistName
        : "",
    albumName:
      typeof attributes?.albumName === "string" ? attributes.albumName : "",
    url: typeof attributes?.url === "string" ? attributes.url : "",
  };
}

function appleError(data: unknown, fallback: string): string {
  if (typeof data !== "object" || data === null) {
    return fallback;
  }
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.errors) && record.errors[0]) {
    const first = record.errors[0];
    if (typeof first === "object" && first !== null) {
      const error = first as Record<string, unknown>;
      if (typeof error.detail === "string") {
        return error.detail;
      }
      if (typeof error.title === "string") {
        return error.title;
      }
    }
  }
  return fallback;
}
