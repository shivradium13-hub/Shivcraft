import { eq } from "drizzle-orm";

import { bannerSchema } from "@/lib/adminValidation";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { banners } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route(
  async (request: Request, context: RouteContext<"/api/admin/banners/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;
    const input = await readJson(request, bannerSchema);

    const existing = await db
      .select({ id: banners.id, placement: banners.placement, position: banners.position })
      .from(banners)
      .where(eq(banners.id, id))
      .limit(1);

    if (!existing[0]) throw new ApiError("NOT_FOUND", "That banner does not exist.");

    const [row] = await db
      .update(banners)
      .set({
        title: input.title,
        subtitle: input.subtitle || null,
        imageUrl: input.imageUrl || null,
        href: input.href || null,
        ctaLabel: input.ctaLabel || null,
        placement: input.placement,
        // Position belongs to the reorder controls; an edit keeps its place
        // unless the banner is moving to a different placement entirely.
        position: input.placement === existing[0].placement ? existing[0].position : 999,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        isActive: input.isActive,
      })
      .where(eq(banners.id, id))
      .returning();

    return ok({ banner: row });
  },
);

export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/admin/banners/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;

    const existing = await db
      .select({ id: banners.id, title: banners.title })
      .from(banners)
      .where(eq(banners.id, id))
      .limit(1);

    if (!existing[0]) throw new ApiError("NOT_FOUND", "That banner does not exist.");

    /* Nothing references a banner, so this one really is just a delete — no
       history to protect the way a used coupon has. */
    await db.delete(banners).where(eq(banners.id, id));
    return ok({ deleted: true, title: existing[0].title });
  },
);
