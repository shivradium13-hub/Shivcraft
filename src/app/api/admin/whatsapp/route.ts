import { z } from "zod";

import { ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { getWhatsappSettings, writeWhatsappSettings } from "@/server/whatsapp/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* normaliseWhatsapp repairs/bounds every field on write, so the body only needs
   to be roughly the right shape; these caps stop an oversized payload. */
const schema = z.object({
  enabled: z.boolean().optional(),
  otpEnabled: z.boolean().optional(),
  otpTtlMinutes: z.number().min(1).max(30).optional(),
  otpResendSeconds: z.number().min(15).max(300).optional(),
  otpMaxAttempts: z.number().min(3).max(10).optional(),
  notifyConfirmed: z.boolean().optional(),
  notifyShipped: z.boolean().optional(),
  notifyOutForDelivery: z.boolean().optional(),
  notifyDelivered: z.boolean().optional(),
  templateOtp: z.string().max(80).optional(),
  templateConfirmed: z.string().max(80).optional(),
  templateShipped: z.string().max(80).optional(),
  templateOutForDelivery: z.string().max(80).optional(),
  templateDelivered: z.string().max(80).optional(),
  templateLang: z.string().max(12).optional(),
  rateAuthPaise: z.number().min(0).max(100000).optional(),
  rateUtilityPaise: z.number().min(0).max(100000).optional(),
});

export const GET = route(async () => {
  await requireAdmin();
  return ok(await getWhatsappSettings());
});

export const PUT = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, schema);
  return ok(await writeWhatsappSettings(input));
});
