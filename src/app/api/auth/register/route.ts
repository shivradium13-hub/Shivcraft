import { sql } from "drizzle-orm";

import { registerSchema } from "@/lib/validation";
import { ApiError, created, readJson, route } from "@/server/api/http";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export const runtime = "nodejs";

export const POST = route(async (request: Request) => {
  const input = await readJson(request, registerSchema);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);

  if (existing.length > 0) {
    throw new ApiError("CONFLICT", "An account with this email already exists. Try signing in.", {
      email: "This email is already registered.",
    });
  }

  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
      role: "USER",
    })
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
    });

  await createSession(user.id, request.headers.get("user-agent"));

  return created({ user });
});
