export const BANDS = ["low", "mid", "high"] as const;
export type Band = (typeof BANDS)[number];

export type GenreMoodProfile = {
  valence?: Band;
  energy?: Band;
  tempo?: Band;
  mode?: "minor" | "major";
  moodTags: string[];
  searchTerms: string[];
};

export type FeatureRange = {
  min: number;
  max: number;
  target: number;
};

export type MoodFilters = {
  moodTags: string[];
  searchTerms: string[];
  matchedGenres: string[];
  audioFeatures: {
    valence: FeatureRange;
    energy: FeatureRange;
    tempo: FeatureRange;
    mode: 0 | 1 | null;
  };
};

const UNIT_RANGE: Record<Band, FeatureRange> = {
  low: { min: 0, max: 0.4, target: 0.2 },
  mid: { min: 0.3, max: 0.7, target: 0.5 },
  high: { min: 0.6, max: 1, target: 0.8 },
};

const TEMPO_RANGE: Record<Band, FeatureRange> = {
  low: { min: 50, max: 90, target: 70 },
  mid: { min: 80, max: 120, target: 100 },
  high: { min: 110, max: 180, target: 140 },
};

export const GENRE_MOOD_MAP: Record<string, GenreMoodProfile> = {
  "gothic romance": {
    valence: "low",
    tempo: "low",
    mode: "minor",
    moodTags: ["dark", "romantic", "haunting"],
    searchTerms: ["dark academia", "haunting piano", "gothic"],
  },
  gothic: {
    valence: "low",
    energy: "low",
    tempo: "low",
    mode: "minor",
    moodTags: ["dark", "haunting"],
    searchTerms: ["gothic", "dark ambient"],
  },
  thriller: {
    energy: "high",
    tempo: "high",
    mode: "minor",
    moodTags: ["tense", "urgent"],
    searchTerms: ["dark electronic", "noir"],
  },
  horror: {
    valence: "low",
    energy: "high",
    tempo: "mid",
    mode: "minor",
    moodTags: ["ominous", "fearful"],
    searchTerms: ["dark ambient", "industrial"],
  },
  mystery: {
    valence: "low",
    energy: "mid",
    tempo: "mid",
    mode: "minor",
    moodTags: ["suspenseful", "curious"],
    searchTerms: ["mystery", "noir jazz"],
  },
  crime: {
    energy: "high",
    tempo: "mid",
    mode: "minor",
    moodTags: ["gritty", "tense"],
    searchTerms: ["crime noir", "dark hip hop"],
  },
  romance: {
    valence: "high",
    energy: "mid",
    tempo: "mid",
    mode: "major",
    moodTags: ["warm", "tender"],
    searchTerms: ["romantic", "love songs"],
  },
  fantasy: {
    valence: "mid",
    energy: "mid",
    tempo: "mid",
    moodTags: ["wondrous", "epic"],
    searchTerms: ["folk", "celtic"],
  },
  "science fiction": {
    valence: "mid",
    energy: "high",
    tempo: "mid",
    moodTags: ["futuristic", "expansive"],
    searchTerms: ["synthwave", "space ambient"],
  },
  dystopian: {
    valence: "low",
    energy: "high",
    tempo: "mid",
    mode: "minor",
    moodTags: ["bleak", "defiant"],
    searchTerms: ["dystopian", "industrial"],
  },
  adventure: {
    valence: "high",
    energy: "high",
    tempo: "high",
    mode: "major",
    moodTags: ["bold", "adventurous"],
    searchTerms: ["upbeat folk", "adventure rock"],
  },
  historical: {
    valence: "mid",
    energy: "low",
    tempo: "low",
    moodTags: ["reflective", "period"],
    searchTerms: ["classical", "period drama"],
  },
  "young adult": {
    valence: "mid",
    energy: "mid",
    tempo: "mid",
    moodTags: ["earnest", "coming of age"],
    searchTerms: ["indie pop", "coming of age"],
  },
  humor: {
    valence: "high",
    energy: "high",
    tempo: "high",
    mode: "major",
    moodTags: ["playful", "light"],
    searchTerms: ["upbeat", "comedy"],
  },
  comedy: {
    valence: "high",
    energy: "high",
    tempo: "high",
    mode: "major",
    moodTags: ["playful", "light"],
    searchTerms: ["upbeat", "fun"],
  },
  poetry: {
    valence: "mid",
    energy: "low",
    tempo: "low",
    moodTags: ["intimate", "lyrical"],
    searchTerms: ["acoustic", "spoken word", "soft piano"],
  },
  paranormal: {
    valence: "low",
    energy: "mid",
    tempo: "low",
    mode: "minor",
    moodTags: ["eerie", "otherworldly"],
    searchTerms: ["darkwave", "witch house"],
  },
  western: {
    valence: "mid",
    energy: "mid",
    tempo: "mid",
    mode: "major",
    moodTags: ["dusty", "open"],
    searchTerms: ["western", "americana"],
  },
  memoir: {
    valence: "mid",
    energy: "low",
    tempo: "low",
    moodTags: ["intimate", "reflective"],
    searchTerms: ["singer songwriter", "acoustic"],
  },
  "dark comedy": {
    valence: "mid",
    energy: "mid",
    tempo: "mid",
    moodTags: ["dark", "playful"],
    searchTerms: ["dark pop", "quirky indie"],
  },
  "literary fiction": {
    valence: "mid",
    energy: "low",
    tempo: "low",
    moodTags: ["intimate", "reflective"],
    searchTerms: ["indie folk", "singer songwriter"],
  },
  literary: {
    valence: "mid",
    energy: "low",
    tempo: "low",
    moodTags: ["intimate", "reflective"],
    searchTerms: ["indie folk", "literary"],
  },
  contemporary: {
    valence: "mid",
    energy: "mid",
    tempo: "mid",
    moodTags: ["intimate", "playful"],
    searchTerms: ["indie pop", "indie folk"],
  },
  fiction: {
    valence: "mid",
    energy: "mid",
    tempo: "mid",
    moodTags: ["intimate"],
    searchTerms: ["indie"],
  },
};

const BAND_SCORE: Record<Band, number> = { low: 0, mid: 1, high: 2 };

export function mapGenreTagsToMoodFilters(genreTags: string[]): MoodFilters {
  const matches: Array<{ key: string; profile: GenreMoodProfile }> = [];

  for (const tag of genreTags) {
    matches.push(...matchGenres(tag));
  }

  const uniqueMatches = dropGenericFiction(dedupeByKey(matches));
  const profiles = uniqueMatches.map((match) => match.profile);

  return {
    matchedGenres: uniqueMatches.map((match) => match.key),
    moodTags: uniqueStrings(profiles.flatMap((profile) => profile.moodTags)),
    searchTerms: uniqueStrings(profiles.flatMap((profile) => profile.searchTerms)),
    audioFeatures: {
      valence: mergeBand(
        profiles.map((profile) => profile.valence),
        UNIT_RANGE
      ),
      energy: mergeBand(
        profiles.map((profile) => profile.energy),
        UNIT_RANGE
      ),
      tempo: mergeBand(
        profiles.map((profile) => profile.tempo),
        TEMPO_RANGE
      ),
      mode: mergeMode(profiles.map((profile) => profile.mode)),
    },
  };
}

function matchGenres(
  tag: string
): Array<{ key: string; profile: GenreMoodProfile }> {
  const normalized = normalize(tag);
  if (!normalized) {
    return [];
  }

  const matches: Array<{ key: string; profile: GenreMoodProfile }> = [];
  for (const [key, profile] of Object.entries(GENRE_MOOD_MAP)) {
    if (normalized === key || normalized.includes(key)) {
      matches.push({ key, profile });
    }
  }
  return matches;
}

function dropGenericFiction(
  matches: Array<{ key: string; profile: GenreMoodProfile }>
): Array<{ key: string; profile: GenreMoodProfile }> {
  if (matches.some((match) => match.key !== "fiction")) {
    return matches.filter((match) => match.key !== "fiction");
  }
  return matches;
}

function mergeBand(
  bands: Array<Band | undefined>,
  table: Record<Band, FeatureRange>
): FeatureRange {
  const present = bands.filter((band): band is Band => band !== undefined);
  if (present.length === 0) {
    return table.mid;
  }

  const avg =
    present.reduce((sum, band) => sum + BAND_SCORE[band], 0) / present.length;

  if (avg < 0.75) {
    return table.low;
  }
  if (avg > 1.25) {
    return table.high;
  }
  return table.mid;
}

function mergeMode(modes: Array<"minor" | "major" | undefined>): 0 | 1 | null {
  const present = modes.filter(
    (mode): mode is "minor" | "major" => mode !== undefined
  );
  if (present.length === 0) {
    return null;
  }
  const unique = new Set(present);
  if (unique.size !== 1) {
    return null;
  }
  return unique.has("major") ? 1 : 0;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeByKey(
  matches: Array<{ key: string; profile: GenreMoodProfile }>
): Array<{ key: string; profile: GenreMoodProfile }> {
  const seen = new Set<string>();
  const result: Array<{ key: string; profile: GenreMoodProfile }> = [];
  for (const match of matches) {
    if (seen.has(match.key)) {
      continue;
    }
    seen.add(match.key);
    result.push(match);
  }
  return result;
}
