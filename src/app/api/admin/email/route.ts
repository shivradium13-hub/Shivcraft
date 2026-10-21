import { z } from "zod";

import { ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { getEmailSettings, writeEmailSettings } from "@/server/email/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* normaliseEmail bounds/repairs every field on write, so the body only needs to
   be roughly the right shape; these caps stop an oversized payload. */
const schema = z.object({
  enabled: z.boolean().optional(),
  otpEnabled: z.boolean().optional(),
  senderEmail: z.string().max(120).optional(),
  senderName: z.string().max(120).optional(),
  otpSubject: z.string().max(200).optional(),
});

export const GET = route(async () => {
  await requireAdmin();
  return ok(await getEmailSettings());
});

export const PUT = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, schema);
  return ok(await writeEmailSettings(input));
});
