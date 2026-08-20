import { query } from "./_generated/server";
import { v } from "convex/values";

export const ping = query({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    message: v.string(),
  }),
  handler: async () => {
    return {
      ok: true,
      message: "Convex connected",
    };
  },
});
