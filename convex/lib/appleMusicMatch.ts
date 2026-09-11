import { normalizeText } from "./trackMatch";

export type AppleSongCandidate = {
  id: string;
  name: string;
  artistName: string;
  albumName: string;
  url: string;
  albumImageUrl: string | null;
  previewUrl: string | null;
};

const VERSION_PENALTIES = [
  "live",
  "remix",
  "instrumental",
  "karaoke",
  "sped up",
  "slowed",
  "nightcore",
];

export function scoreAppleSongMatch(
  trackName: string,
  trackArtists: string,
  song: AppleSongCandidate
): number {
  const name = normalizeText(trackName);
  const songName = normalizeText(song.name);
  if (!name || !songName) {
    return 0;
  }

  let score = 0;
  if (name === songName) {
    score += 12;
  } else if (songName.startsWith(name) || name.startsWith(songName)) {
    score += 8;
  } else if (songName.includes(name) || name.includes(songName)) {
    score += 4;
  } else {
    return 0;
  }

  const artistTokens = normalizeText(trackArtists)
    .split(" ")
    .filter((token) => token.length > 2);
  const songArtist = normalizeText(song.artistName);
  const artistHits = artistTokens.filter((token) =>
    songArtist.includes(token)
  ).length;
  if (artistHits > 0) {
    score += Math.min(6, artistHits * 2);
  } else {
    score -= 4;
  }

  for (const extra of VERSION_PENALTIES) {
    if (songName.includes(extra) && !name.includes(extra)) {
      score -= 3;
    }
  }

  return score;
}

export function pickBestAppleSong(
  trackName: string,
  trackArtists: string,
  songs: AppleSongCandidate[]
): AppleSongCandidate | null {
  let best: { song: AppleSongCandidate; score: number } | null = null;
  for (const song of songs) {
    const score = scoreAppleSongMatch(trackName, trackArtists, song);
    if (score <= 0) {
      continue;
    }
    if (!best || score > best.score) {
      best = { song, score };
    }
  }
  return best && best.score >= 8 ? best.song : null;
}

export function firstArtistName(artists: string): string {
  const primary = artists.split(",")[0] ?? artists;
  return primary.replace(/\s+\(?feat\.?.*$/i, "").trim();
}

export function appleSongToTrack(song: AppleSongCandidate): {
  id: string;
  name: string;
  artists: string;
  album: string;
  albumImageUrl: string | null;
  previewUrl: string | null;
  uri: string;
  externalUrl: string;
} {
  return {
    id: song.id,
    name: song.name,
    artists: song.artistName || "Unknown artist",
    album: song.albumName || "Unknown album",
    albumImageUrl: song.albumImageUrl,
    previewUrl: song.previewUrl,
    uri: `apple:song:${song.id}`,
    externalUrl:
      song.url || `https://music.apple.com/search?term=${encodeURIComponent(song.name)}`,
  };
}
