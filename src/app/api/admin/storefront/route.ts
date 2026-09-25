import { ok, readJson, route } from "@/server/api/http";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/guards";
import { getStorefrontSettings, writeStorefrontSettings } from "@/server/settings/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The stored shape is validated and repaired by normaliseStorefront on write,
   so the body only needs to be roughly the right shape here. Bounds keep a
   malformed or oversized payload from reaching that normaliser. */
const schema = z.object({
  home: z
    .array(z.object({ id: z.string().max(40), enabled: z.boolean() }))
    .max(40)
    .optional(),
  product: z.record(z.string().max(40), z.boolean()).optional(),
  promises: z
    .array(z.object({ title: z.string().max(200), body: z.string().max(500) }))
    .max(40)
    .optional(),
});

export const GET = route(async () => {
  await requireAdmin();
  return ok(await getStorefrontSettings());
});

export const PUT = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, schema);
  return ok(await writeStorefrontSettings(input));
});
