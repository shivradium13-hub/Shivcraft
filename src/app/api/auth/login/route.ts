import { sql } from "drizzle-orm";

import { loginSchema } from "@/lib/validation";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { mergeGuestCart } from "@/server/cart/merge";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export const runtime = "nodejs";

/** Burned when no account matches, so a wrong email costs the same time as a
 *  wrong password and the response cannot be used to enumerate accounts. */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "Y2Fubm90bWF0Y2hhbnl0aGluZ2V2ZXJiZWNhdXNldGhpc2lzbm90YXJlYWxrZXlhdGFsbA==";

export const POST = route(async (request: Request) => {
  const input = await readJson(request, loginSchema);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      isBlocked: users.isBlocked,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);

  const account = rows[0];
  const matches = await verifyPassword(input.password, account?.passwordHash ?? DUMMY_HASH);

  if (!account || !matches) {
    throw new ApiError("UNAUTHORIZED", "That email or password is not right.");
  }

  if (account.isBlocked) {
    throw new ApiError(
      "FORBIDDEN",
      "This account has been suspended. Contact support if you think that is a mistake.",
    );
  }

  await createSession(account.id, request.headers.get("user-agent"));

  // Carry anything added while signed out onto the account.
  await mergeGuestCart(account.id);

  return ok({
    user: {
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      role: account.role,
    },
  });
});
