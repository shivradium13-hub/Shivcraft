import { z } from "zod";

import { ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { getReportSettings, writeReportSettings } from "@/server/reports/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The admin controls who the daily report goes to, when, and whether it runs —
   normaliseReports bounds every field on write. The template name, language and
   the internal once-a-day guard are server-managed, so they are merged from the
   current settings rather than taken from the form. */
const schema = z.object({
  enabled: z.boolean().optional(),
  whatsappTo: z.string().max(20).optional(),
  emailTo: z.string().max(120).optional(),
  sendHour: z.number().int().min(0).max(23).optional(),
  whatsappPdf: z.boolean().optional(),
});

export const GET = route(async () => {
  await requireAdmin();
  return ok(await getReportSettings());
});

export const PUT = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, schema);
  const current = await getReportSettings();
  return ok(await writeReportSettings({ ...current, ...input }));
});
