import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { savedDesigns } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const renameSchema = z.object({ name: z.string().trim().min(1, "Give this design a name.").max(120) });

/** PATCH — rename a saved design. Scoped to the caller's own rows. */
export const PATCH = route(
  async (request: Request, context: RouteContext<"/api/designs/[id]">) => {
    const user = await requireUser();
    const { id } = await context.params;
    const input = await readJson(request, renameSchema);

    const [row] = await db
      .update(savedDesigns)
      .set({ name: input.name, updatedAt: new Date() })
      .where(and(eq(savedDesigns.id, id), eq(savedDesigns.userId, user.id)))
      .returning({ id: savedDesigns.id, name: savedDesigns.name });

    if (!row) throw new ApiError("NOT_FOUND", "That saved design does not exist.");
    return ok({ design: row });
  },
);

/**
 * DELETE — remove a saved design.
 *
 * Removes only this row. The photos it referenced are left in place: they may
 * belong to an order, and are governed by the upload retention policy rather
 * than by whether a saved design still points at them (§44).
 */
export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/designs/[id]">) => {
    const user = await requireUser();
    const { id } = await context.params;

    const [row] = await db
      .delete(savedDesigns)
      .where(and(eq(savedDesigns.id, id), eq(savedDesigns.userId, user.id)))
      .returning({ id: savedDesigns.id });

    if (!row) throw new ApiError("NOT_FOUND", "That saved design does not exist.");
    return ok({ deleted: true });
  },
);
