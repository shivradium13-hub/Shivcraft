import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { bannerSchema } from "@/lib/adminValidation";
import { created, ok, readJson, route } from "@/server/api/http";
import { listAdminBanners } from "@/server/admin/promos";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { banners } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reorderSchema = z.object({ order: z.array(z.string().uuid()).max(100) });

export const GET = route(async () => {
  await requireAdmin();
  return ok({ banners: await listAdminBanners() });
});

export const POST = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, bannerSchema);

  /* A new banner goes to the end of its placement, so adding one never
     displaces the banner currently on the homepage. */
  const lastRows = await db
    .select({ max: sql<number>`coalesce(max(${banners.position}), -1)::int` })
    .from(banners)
    .where(eq(banners.placement, input.placement));

  const [row] = await db
    .insert(banners)
    .values({
      title: input.title,
      subtitle: input.subtitle || null,
      imageUrl: input.imageUrl || null,
      href: input.href || null,
      ctaLabel: input.ctaLabel || null,
      placement: input.placement,
      position: (lastRows[0]?.max ?? -1) + 1,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      isActive: input.isActive,
    })
    .returning();

  return created({ banner: row });
});

/**
 * PATCH /api/admin/banners — the new order of one placement, in one call.
 *
 * Sent as a whole list rather than "move this one up", so the positions the
 * admin sees and the positions stored cannot drift apart. One transaction, so
 * a failure halfway cannot leave two banners fighting for the same slot.
 */
export const PATCH = route(async (request: Request) => {
  await requireAdmin();
  const { order } = await readJson(request, reorderSchema);

  await db.transaction(async (tx) => {
    for (const [index, id] of order.entries()) {
      await tx.update(banners).set({ position: index }).where(eq(banners.id, id));
    }
  });

  return ok({ reordered: order.length });
});
