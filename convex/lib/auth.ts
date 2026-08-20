import { QueryCtx, MutationCtx } from "../_generated/server";

export async function requireIdentity(
  ctx: QueryCtx | MutationCtx
): Promise<{ tokenIdentifier: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

export async function getAddedBy(ctx: MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? "anonymous";
}
