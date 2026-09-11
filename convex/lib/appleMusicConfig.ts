export function appleMusicConfigured(): boolean {
  return Boolean(
    process.env.APPLE_MUSIC_TEAM_ID &&
      process.env.APPLE_MUSIC_KEY_ID &&
      process.env.APPLE_MUSIC_PRIVATE_KEY
  );
}
