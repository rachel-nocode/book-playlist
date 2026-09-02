/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as books from "../books.js";
import type * as crons from "../crons.js";
import type * as googleBooks from "../googleBooks.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_genreMoodMap from "../lib/genreMoodMap.js";
import type * as lib_trackMatch from "../lib/trackMatch.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_vibes from "../lib/vibes.js";
import type * as mood from "../mood.js";
import type * as playlists from "../playlists.js";
import type * as spotify from "../spotify.js";
import type * as spotifyActions from "../spotifyActions.js";
import type * as status from "../status.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  books: typeof books;
  crons: typeof crons;
  googleBooks: typeof googleBooks;
  "lib/auth": typeof lib_auth;
  "lib/genreMoodMap": typeof lib_genreMoodMap;
  "lib/trackMatch": typeof lib_trackMatch;
  "lib/validators": typeof lib_validators;
  "lib/vibes": typeof lib_vibes;
  mood: typeof mood;
  playlists: typeof playlists;
  spotify: typeof spotify;
  spotifyActions: typeof spotifyActions;
  status: typeof status;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
