import { v } from "convex/values";

export const featureRange = v.object({
  min: v.number(),
  max: v.number(),
  target: v.number(),
});

export const moodFilters = v.object({
  moodTags: v.array(v.string()),
  searchTerms: v.array(v.string()),
  matchedGenres: v.array(v.string()),
  audioFeatures: v.object({
    valence: featureRange,
    energy: featureRange,
    tempo: featureRange,
    mode: v.union(v.literal(0), v.literal(1), v.null()),
  }),
});

export const spotifyTrack = v.object({
  id: v.string(),
  name: v.string(),
  artists: v.string(),
  album: v.string(),
  albumImageUrl: v.union(v.string(), v.null()),
  previewUrl: v.union(v.string(), v.null()),
  uri: v.string(),
  externalUrl: v.string(),
});
