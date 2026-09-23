import { and, eq } from "drizzle-orm";

import { ApiError, ok, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { savedDesigns } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_USER = 50;

/**
 * POST — duplicate a saved design (§38).
 *
 * Copies the design JSON as-is, which is enough because a design references
 * its photos by id and never copies the files — the duplicate points at the
 * same uploads, which already belong to this customer.
 */
export const POST = route(
  async (_request: Request, context: RouteContext<"/api/designs/[id]/duplicate">) => {
    const user = await requireUser();
    const { id } = await context.params;

    const [source] = await db
      .select()
      .from(savedDesigns)
      .where(and(eq(savedDesigns.id, id), eq(savedDesigns.userId, user.id)))
      .limit(1);

    if (!source) throw new ApiError("NOT_FOUND", "That saved design does not exist.");

    const count = await db.$count(savedDesigns, eq(savedDesigns.userId, user.id));
    if (count >= MAX_PER_USER) {
      throw new ApiError(
        "BAD_REQUEST",
        `You have reached ${MAX_PER_USER} saved designs. Delete one to duplicate another.`,
      );
    }

    const [row] = await db
      .insert(savedDesigns)
      .values({
        userId: user.id,
        productId: source.productId,
        name: `${source.name} (copy)`.slice(0, 120),
        design: source.design,
        configVersion: source.configVersion,
      })
      .returning({ id: savedDesigns.id });

    return ok({ id: row.id });
  },
);
