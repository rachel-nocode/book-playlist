import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "refresh playlists",
  { hourUTC: 6, minuteUTC: 17 },
  internal.playlists.kickoffDailyRefresh
);

export default crons;
