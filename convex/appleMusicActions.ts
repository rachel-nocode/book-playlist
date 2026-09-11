"use node";

import { SignJWT, importPKCS8 } from "jose";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  firstArtistName,
  pickBestAppleSong,
  appleSongToTrack,
  type AppleSongCandidate,
} from "./lib/appleMusicMatch";
import {
  allowedAppleMusicOrigins,
  appleMusicConfigured,
  parseOrigin,
} from "./lib/appleMusicConfig";
import { mapGenreTagsToMoodFilters } from "./lib/genreMoodMap";
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
    const origin = musicKitOrigin(args.origin);
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

    // MusicKit JWTs may include `origin` and are rejected by the Music API
    // when called from Convex. Always mint a server token with no origin.
    const developerToken = await signDeveloperToken();
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

export const buildSoundtrack = action({
  args: {
    sessionId: v.optional(v.id("sessions")),
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

    const book = await ctx.runQuery(internal.appleMusic.getBookContext, {
      bookId: args.bookId,
      sessionId: args.sessionId,
    });
    // Ignore any MusicKit token from the client; it may be origin-bound.
    const developerToken = await signDeveloperToken();
    const storefront = await getStorefront(
      developerToken,
      args.musicUserToken
    );
    const compiled = await compileAppleBookTracks(
      developerToken,
      storefront,
      book
    );
    if (compiled.tracks.length === 0) {
      throw new Error("No matching Apple Music tracks yet. Try a different vibe.");
    }

    if (compiled.moodTags.length > 0) {
      await ctx.runMutation(internal.books.persistMoodTags, {
        bookId: args.bookId,
        moodTags: compiled.moodTags,
      });
    }

    await ctx.runMutation(internal.playlists.overwriteTracks, {
      bookId: args.bookId,
      tracks: compiled.tracks,
      sourceHint: compiled.sourceHint,
      provider: "appleMusic",
    });

    const created = await createApplePlaylist(
      developerToken,
      args.musicUserToken,
      {
        name: playlistName(book.bookTitle),
        description: `Book Playlist soundtrack for ${book.bookTitle} by ${book.author}`,
        songs: compiled.songs,
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
      matchedCount: compiled.tracks.length,
      unmatched: [],
    };
  },
});

export const refreshCatalog = internalAction({
  args: { bookId: v.id("books") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (!appleMusicConfigured()) {
      return null;
    }
    const bookDoc = await ctx.runQuery(internal.books.get, {
      bookId: args.bookId,
    });
    if (!bookDoc) {
      return null;
    }
    const book = {
      bookTitle: bookDoc.title,
      author: bookDoc.author,
      genreTags: bookDoc.genreTags,
      moodTags: bookDoc.moodTags,
    };
    const developerToken = await signDeveloperToken();
    const storefront = process.env.APPLE_MUSIC_STOREFRONT?.trim() || "us";
    const compiled = await compileAppleBookTracks(
      developerToken,
      storefront,
      book
    );
    if (compiled.tracks.length === 0) {
      return null;
    }
    if (compiled.moodTags.length > 0) {
      await ctx.runMutation(internal.books.persistMoodTags, {
        bookId: args.bookId,
        moodTags: compiled.moodTags,
      });
    }
    await ctx.runMutation(internal.playlists.overwriteTracks, {
      bookId: args.bookId,
      tracks: compiled.tracks,
      sourceHint: compiled.sourceHint,
      provider: "appleMusic",
    });
    return null;
  },
});

function playlistName(title: string): string {
  const trimmed = title.trim() || "Book soundtrack";
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

const TARGET_TRACKS = 10;
const MAX_PLAYLISTS = 3;
const TRACKS_PER_PLAYLIST = 30;

type CompiledAppleTrack = ReturnType<typeof appleSongToTrack>;

async function compileAppleBookTracks(
  developerToken: string,
  storefront: string,
  book: {
    bookTitle: string;
    author: string;
    genreTags: string[];
    moodTags: string[];
  }
): Promise<{
  tracks: CompiledAppleTrack[];
  songs: AppleSongCandidate[];
  sourceHint: string;
  moodTags: VibeId[];
}> {
  const filters = mapGenreTagsToMoodFilters(book.genreTags);
  const vibeIds = resolveVibeIds(book.moodTags, filters.moodTags);
  const vibes = resolveVibeOptions(vibeIds);
  const harvested = await harvestApplePlaylists(
    developerToken,
    storefront,
    book.bookTitle,
    book.author
  );
  const catalog = await searchAppleCatalogFill(
    developerToken,
    storefront,
    book,
    vibes,
    filters.searchTerms
  );
  const ranked = mergeRankedAppleSongs(
    [
      { songs: harvested, bonus: 8 },
      { songs: catalog, bonus: 1 },
    ],
    vibes
  ).slice(0, TARGET_TRACKS);

  const fromPlaylists = harvested.length > 0;
  return {
    songs: ranked,
    tracks: ranked.map(appleSongToTrack),
    sourceHint: appleSourceHint(book.bookTitle, vibeIds, fromPlaylists),
    moodTags: vibeIds,
  };
}

function appleSourceHint(
  title: string,
  vibeIds: VibeId[],
  fromPlaylists: boolean
): string {
  if (fromPlaylists && title.trim()) {
    return `Apple Music playlists named ${title.trim()}`;
  }
  const labels = vibeLabels(vibeIds);
  if (labels.length > 0) {
    return `Apple Music ${labels.join(" + ")} search`;
  }
  if (title.trim()) {
    return `Apple Music “${title.trim()}” search`;
  }
  return "Apple Music vibe search";
}

async function harvestApplePlaylists(
  developerToken: string,
  storefront: string,
  title: string,
  author: string
): Promise<AppleSongCandidate[]> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return [];
  }
  const queries = [`${trimmedTitle}`];
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
    const found = await searchApplePlaylists(
      developerToken,
      storefront,
      query,
      10
    );
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

  const top = dedupeById(playlists)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_PLAYLISTS);

  const songs: AppleSongCandidate[] = [];
  for (const playlist of top) {
    songs.push(
      ...(await getApplePlaylistTracks(
        developerToken,
        storefront,
        playlist.id,
        TRACKS_PER_PLAYLIST
      ))
    );
  }
  return songs;
}

async function searchAppleCatalogFill(
  developerToken: string,
  storefront: string,
  book: { bookTitle: string; author: string },
  vibes: VibeOption[],
  genreSearchTerms: string[]
): Promise<AppleSongCandidate[]> {
  const queries = buildCatalogQueries({
    title: book.bookTitle,
    author: book.author,
    vibeSearchTerms: vibes.flatMap((vibe) => [...vibe.searchTerms]),
    genreSearchTerms,
  });
  const songs: AppleSongCandidate[] = [];
  for (const query of queries) {
    songs.push(
      ...(await searchSongs(developerToken, storefront, query))
    );
  }
  return songs;
}

function mergeRankedAppleSongs(
  groups: Array<{ songs: AppleSongCandidate[]; bonus: number }>,
  vibes: VibeOption[]
): AppleSongCandidate[] {
  const byId = new Map<string, AppleSongCandidate & { score: number }>();
  for (const group of groups) {
    for (const song of group.songs) {
      if (isTrailerText(`${song.name} ${song.artistName} ${song.albumName}`)) {
        continue;
      }
      const add =
        group.bonus +
        trackVibeScore(
          `${song.name} ${song.artistName} ${song.albumName}`,
          vibes
        );
      const existing = byId.get(song.id);
      if (existing) {
        existing.score += add;
      } else {
        byId.set(song.id, { ...song, score: add });
      }
    }
  }
  return [...byId.values()]
    .sort((left, right) => right.score - left.score)
    .map((ranked) => ({
      id: ranked.id,
      name: ranked.name,
      artistName: ranked.artistName,
      albumName: ranked.albumName,
      url: ranked.url,
      albumImageUrl: ranked.albumImageUrl,
      previewUrl: ranked.previewUrl,
    }));
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

async function searchApplePlaylists(
  developerToken: string,
  storefront: string,
  term: string,
  limit: number
): Promise<Array<{ id: string; name: string; description: string }>> {
  const url = new URL(`${APPLE_API}/catalog/${storefront}/search`);
  url.searchParams.set("term", term);
  url.searchParams.set("types", "playlists");
  url.searchParams.set("limit", String(limit));
  const response = await appleFetch(url.toString(), developerToken);
  if (!response.ok) {
    return [];
  }
  const data: unknown = await response.json();
  return parseSearchPlaylists(data);
}

async function getApplePlaylistTracks(
  developerToken: string,
  storefront: string,
  playlistId: string,
  limit: number
): Promise<AppleSongCandidate[]> {
  const url = new URL(
    `${APPLE_API}/catalog/${storefront}/playlists/${playlistId}/tracks`
  );
  url.searchParams.set("limit", String(limit));
  const response = await appleFetch(url.toString(), developerToken);
  if (!response.ok) {
    return [];
  }
  const data: unknown = await response.json();
  return parseSongList(data);
}

function parseSearchPlaylists(
  data: unknown
): Array<{ id: string; name: string; description: string }> {
  if (typeof data !== "object" || data === null || !("results" in data)) {
    return [];
  }
  const results = (data as { results: unknown }).results;
  if (
    typeof results !== "object" ||
    results === null ||
    !("playlists" in results)
  ) {
    return [];
  }
  const playlists = (results as { playlists: unknown }).playlists;
  if (
    typeof playlists !== "object" ||
    playlists === null ||
    !("data" in playlists)
  ) {
    return [];
  }
  const items = (playlists as { data: unknown }).data;
  if (!Array.isArray(items)) {
    return [];
  }
  const parsed: Array<{ id: string; name: string; description: string }> = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") {
      continue;
    }
    const attributes =
      typeof record.attributes === "object" && record.attributes !== null
        ? (record.attributes as Record<string, unknown>)
        : null;
    const name = typeof attributes?.name === "string" ? attributes.name : "";
    if (!name) {
      continue;
    }
    parsed.push({
      id: record.id,
      name,
      description:
        typeof attributes?.description === "string"
          ? attributes.description
          : typeof attributes?.description === "object" &&
              attributes.description !== null &&
              typeof (attributes.description as Record<string, unknown>)
                .standard === "string"
            ? ((attributes.description as Record<string, unknown>)
                .standard as string)
            : "",
    });
  }
  return parsed;
}

function musicKitOrigin(origin: string | undefined): string | undefined {
  const allowed = allowedAppleMusicOrigins();
  const sanitized = parseOrigin(origin ?? "");
  if (allowed.length === 0) {
    return undefined;
  }
  if (!sanitized || !allowed.includes(sanitized)) {
    throw new Error("This site is not allowed to use Apple Music");
  }
  return sanitized;
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
  const trackData = args.songs.map((song) => ({
    id: song.id,
    type: "songs" as const,
  }));

  try {
    const seeded = await postLibraryPlaylist(developerToken, musicUserToken, {
      attributes: {
        name: args.name,
        description: args.description,
      },
      relationships: {
        tracks: { data: trackData },
      },
    });
    if (seeded) {
      return seeded;
    }
  } catch {
    // Some accounts reject tracks on create. Fall through to add-after-create.
  }

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
      body: JSON.stringify({ data: trackData }),
    }
  );
  if (!addResponse.ok) {
    await deleteLibraryPlaylist(developerToken, musicUserToken, created.id);
    const data: unknown = await addResponse.json().catch(() => null);
    throw new Error(appleError(data, "Could not add tracks to Apple Music"));
  }

  return created;
}

async function deleteLibraryPlaylist(
  developerToken: string,
  musicUserToken: string,
  playlistId: string
): Promise<void> {
  try {
    await appleFetch(
      `${APPLE_API}/me/library/playlists/${encodeURIComponent(playlistId)}`,
      developerToken,
      musicUserToken,
      { method: "DELETE" }
    );
  } catch {
    // Best effort: the add-tracks error is what the user needs to see.
  }
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
    albumImageUrl: artworkUrl(attributes?.artwork),
    previewUrl: previewUrl(attributes?.previews),
  };
}

function artworkUrl(artwork: unknown): string | null {
  if (typeof artwork !== "object" || artwork === null) {
    return null;
  }
  const url = (artwork as Record<string, unknown>).url;
  if (typeof url !== "string" || !url) {
    return null;
  }
  return url.replace("{w}", "300").replace("{h}", "300");
}

function previewUrl(previews: unknown): string | null {
  if (!Array.isArray(previews) || previews.length === 0) {
    return null;
  }
  const first = previews[0];
  if (typeof first !== "object" || first === null) {
    return null;
  }
  const url = (first as Record<string, unknown>).url;
  return typeof url === "string" && url ? url : null;
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
