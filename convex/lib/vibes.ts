export const VIBE_OPTIONS = [
  {
    id: "dark",
    label: "Dark",
    searchTerms: ["dark indie", "moody"],
    blockTerms: ["feel good", "party anthem"],
  },
  {
    id: "light",
    label: "Light",
    searchTerms: ["gentle indie", "soft pop"],
    blockTerms: ["heavy metal", "industrial"],
  },
  {
    id: "upbeat",
    label: "Upbeat",
    searchTerms: ["upbeat indie", "indie pop"],
    blockTerms: ["sad song", "funeral"],
  },
  {
    id: "sad",
    label: "Sad",
    searchTerms: ["sad", "melancholy"],
    blockTerms: ["party", "club"],
  },
  {
    id: "sexy",
    label: "Sexy",
    searchTerms: ["sexy", "slow jam"],
    blockTerms: ["kids", "lullaby"],
  },
  {
    id: "intimate",
    label: "Intimate",
    searchTerms: ["intimate", "acoustic"],
    blockTerms: ["stadium anthem"],
  },
  {
    id: "tense",
    label: "Tense",
    searchTerms: ["noir", "tense"],
    blockTerms: ["feel good"],
  },
  {
    id: "playful",
    label: "Playful",
    searchTerms: ["quirky indie", "playful"],
    blockTerms: ["doom", "funeral"],
  },
] as const;

export type VibeId = (typeof VIBE_OPTIONS)[number]["id"];
export type VibeOption = (typeof VIBE_OPTIONS)[number];

const GENRE_MOOD_TO_VIBE: Record<string, VibeId> = {
  dark: "dark",
  haunting: "dark",
  ominous: "dark",
  eerie: "dark",
  bleak: "dark",
  fearful: "dark",
  light: "light",
  warm: "light",
  playful: "playful",
  tender: "intimate",
  intimate: "intimate",
  reflective: "intimate",
  lyrical: "intimate",
  tense: "tense",
  urgent: "tense",
  gritty: "tense",
  suspenseful: "tense",
};

export function isVibeId(value: string): value is VibeId {
  return VIBE_OPTIONS.some((option) => option.id === value);
}

export function vibeById(id: string): VibeOption | null {
  return VIBE_OPTIONS.find((option) => option.id === id) ?? null;
}

export function sanitizeVibeIds(values: string[]): VibeId[] {
  const unique: VibeId[] = [];
  for (const value of values) {
    if (isVibeId(value) && !unique.includes(value)) {
      unique.push(value);
    }
    if (unique.length >= 2) {
      break;
    }
  }
  return unique;
}

export function inferVibeIds(genreMoodTags: string[]): VibeId[] {
  const inferred: VibeId[] = [];
  for (const tag of genreMoodTags) {
    const vibe = GENRE_MOOD_TO_VIBE[tag];
    if (vibe && !inferred.includes(vibe)) {
      inferred.push(vibe);
    }
    if (inferred.length >= 2) {
      break;
    }
  }
  return inferred;
}

export function resolveVibeIds(
  storedMoodTags: string[],
  genreMoodTags: string[]
): VibeId[] {
  const stored = sanitizeVibeIds(storedMoodTags);
  if (stored.length > 0) {
    return stored;
  }
  return inferVibeIds(genreMoodTags);
}

export function resolveVibeOptions(vibeIds: VibeId[]): VibeOption[] {
  return vibeIds
    .map((id) => vibeById(id))
    .filter((option): option is VibeOption => option !== null);
}

export function vibeLabels(vibeIds: VibeId[]): string[] {
  return resolveVibeOptions(vibeIds).map((option) => option.label);
}
