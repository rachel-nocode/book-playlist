export function appleMusicConfigured(): boolean {
  return Boolean(
    process.env.APPLE_MUSIC_TEAM_ID &&
      process.env.APPLE_MUSIC_KEY_ID &&
      process.env.APPLE_MUSIC_PRIVATE_KEY
  );
}

export function allowedAppleMusicOrigins(): string[] {
  const raw = process.env.APPLE_MUSIC_ORIGIN?.trim() ?? "";
  if (!raw) {
    return [];
  }
  const origins: string[] = [];
  for (const part of raw.split(",")) {
    const origin = parseOrigin(part.trim());
    if (origin && !origins.includes(origin)) {
      origins.push(origin);
    }
  }
  return origins;
}

export function parseOrigin(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}
