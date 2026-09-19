import { settingsSchema } from "@/lib/adminValidation";
import { ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { getAllSettings, writeSetting } from "@/server/settings/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return ok(await getAllSettings());
});

export const PUT = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, settingsSchema);

  await writeSetting("shipping", {
    flatRateP: Math.round(input.shipping.flatRate * 100),
    freeAboveP: Math.round(input.shipping.freeAbove * 100),
    originPincode: input.shipping.originPincode,
    codEnabled: input.shipping.codEnabled,
  });

  await writeSetting("tax", {
    gstPercent: input.tax.gstPercent,
    pricesIncludeTax: input.tax.pricesIncludeTax,
  });

  await writeSetting("support", {
    email: input.support.email || "",
    phone: input.support.phone || "",
    whatsapp: input.support.whatsapp || "",
    hours: input.support.hours || "",
  });

  // Read back rather than echo the input, so the response is what is stored.
  return ok(await getAllSettings());
});
