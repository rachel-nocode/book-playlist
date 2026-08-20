export const SESSION_COOKIE = "bp_session";
export const OAUTH_STATE_COOKIE = "spotify_oauth_state";

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
