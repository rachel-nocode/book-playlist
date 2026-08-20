import { query } from "./_generated/server";
import { v } from "convex/values";
import { mapGenreTagsToMoodFilters } from "./lib/genreMoodMap";
import { moodFilters } from "./lib/validators";

export const fromGenreTags = query({
  args: { genreTags: v.array(v.string()) },
  returns: moodFilters,
  handler: async (_ctx, args) => {
    return mapGenreTagsToMoodFilters(args.genreTags);
  },
});
