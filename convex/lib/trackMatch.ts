import type { VibeOption } from "./vibes";

const TRAILER_PATTERNS = [
  /\btrailer\b/i,
  /\bcinematic\b/i,
  /\bhybrid orchestral\b/i,
  /\bproduction music\b/i,
  /\bstock music\b/i,
  /\btwo steps from hell\b/i,
  /\bimmediate music\b/i,
  /\baudio network\b/i,
  /\btrailerized\b/i,
  /\bepic music\b/i,
  /\bepic orchestral\b/i,
];

const BLOCKED_PLAYLIST_PATTERNS = [
  /\baudiobook\b/i,
  /\bsummary\b/i,
  /\btrailer\b/i,
  /\bmovie ost\b/i,
];

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isTrailerText(value: string): boolean {
  return TRAILER_PATTERNS.some((pattern) => pattern.test(value));
}

export function isBlockedPlaylistName(name: string): boolean {
  return BLOCKED_PLAYLIST_PATTERNS.some((pattern) => pattern.test(name));
}

export function scorePlaylistMatch(
  name: string,
  description: string,
  title: string,
  author: string
): number {
  const normalizedName = normalizeText(name);
  const haystack = `${normalizedName} ${normalizeText(description)}`;
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle || isBlockedPlaylistName(name)) {
    return 0;
  }

  const authorTokens = normalizeText(author)
    .split(" ")
    .filter((token) => token.length > 2);
  const authorHit = authorTokens.some((token) => haystack.includes(token));
  const shortTitle =
    normalizedTitle.length < 5 || !normalizedTitle.includes(" ");

  if (shortTitle && !authorHit && normalizedName !== normalizedTitle) {
    return 0;
  }

  let score = 0;
  if (normalizedName === normalizedTitle) {
    score += 12;
  } else if (normalizedName.startsWith(`${normalizedTitle} `)) {
    score += 9;
  } else if (normalizedName.includes(normalizedTitle)) {
    score += 6;
  } else {
    const words = normalizedTitle.split(" ").filter((word) => word.length > 2);
    if (words.length === 0 || !words.every((word) => normalizedName.includes(word))) {
      return 0;
    }
    score += 4;
  }

  if (authorHit) {
    score += 3;
  }
  return score;
}

export function trackVibeScore(
  text: string,
  vibes: VibeOption[]
): number {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const vibe of vibes) {
    for (const term of vibe.searchTerms) {
      if (haystack.includes(term.toLowerCase())) {
        score += 2;
      }
    }
    for (const term of vibe.blockTerms) {
      if (haystack.includes(term.toLowerCase())) {
        score -= 3;
      }
    }
  }
  return score;
}

export function buildCatalogQueries(args: {
  title: string;
  author: string;
  vibeSearchTerms: string[];
  genreSearchTerms: string[];
}): string[] {
  const title = args.title.trim();
  const quoted = title.includes(" ") ? `"${title}"` : title;
  const vibeTerms = args.vibeSearchTerms.filter((term) => !isTrailerText(term));
  const genreTerms = args.genreSearchTerms.filter((term) => !isTrailerText(term));
  const terms = uniqueStrings([...vibeTerms, ...genreTerms]);
  const queries: string[] = [];

  if (title) {
    queries.push(terms[0] ? `${quoted} ${terms[0]}` : quoted);
    const authorLast = lastName(args.author);
    if (authorLast) {
      queries.push(`${quoted} ${authorLast}`);
    }
  }

  if (terms.length >= 2) {
    queries.push(terms.slice(0, 2).join(" "));
  } else if (terms[0]) {
    queries.push(terms[0]);
  }

  return uniqueStrings(queries).slice(0, 3);
}

export function lastName(author: string): string {
  const parts = normalizeText(author).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
