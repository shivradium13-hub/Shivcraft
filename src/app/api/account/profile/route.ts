import { eq } from "drizzle-orm";
import { z } from "zod";

import { ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The email is deliberately NOT editable here: it identifies the account and
   changing it needs a verification flow, which does not exist yet. Offering
   the field without that would let someone lock themselves out. */
const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^(?:\+?91|0)?[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number.")
    .transform((v) => (v === "" ? null : v.slice(-10)))
    .nullable(),
});

export const PATCH = route(async (request: Request) => {
  const user = await requireUser();
  const input = await readJson(request, schema);

  const [row] = await db
    .update(users)
    .set({ name: input.name, phone: input.phone, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone });

  return ok({ user: row });
});
