import { eq, sql } from "drizzle-orm";

import { loginSchema } from "@/lib/validation";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { mergeGuestCart } from "@/server/cart/merge";
import { clientIp, rateLimit } from "@/server/security/rateLimit";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export const runtime = "nodejs";

/** Burned when no account matches, so a wrong email/mobile costs the same time
 *  as a wrong password and the response cannot be used to enumerate accounts. */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "Y2Fubm90bWF0Y2hhbnl0aGluZ2V2ZXJiZWNhdXNldGhpc2lzbm90YXJlYWxrZXlhdGFsbA==";

const SELECT = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  role: users.role,
  isBlocked: users.isBlocked,
  passwordHash: users.passwordHash,
} as const;

export const POST = route(async (request: Request) => {
  // Throttle brute-force / credential-stuffing: per source IP, then per identity.
  await rateLimit(
    `login:ip:${clientIp(request)}`,
    40,
    300,
    "Too many sign-in attempts. Please wait a few minutes and try again.",
  );

  const input = await readJson(request, loginSchema);

  // Decide whether they gave an email or a mobile number, and look up either.
  const raw = input.identifier.trim();
  const isEmail = raw.includes("@");
  const emailKey = isEmail ? raw.toLowerCase() : null;
  const phoneKey = isEmail ? null : raw.replace(/\D/g, "").slice(-10);

  await rateLimit(
    `login:id:${emailKey ?? phoneKey ?? raw.toLowerCase()}`,
    10,
    300,
    "Too many sign-in attempts for this account. Please wait a few minutes and try again.",
  );

  // `sql\`false\`` matches nothing, so a malformed identifier still runs the
  // dummy-hash path below rather than short-circuiting (no timing tell).
  const where =
    emailKey != null
      ? sql`lower(${users.email}) = ${emailKey}`
      : phoneKey && phoneKey.length === 10
        ? eq(users.phone, phoneKey)
        : sql`false`;

  const rows = await db.select(SELECT).from(users).where(where).limit(1);
  const account = rows[0];

  const matches = await verifyPassword(input.password, account?.passwordHash ?? DUMMY_HASH);

  if (!account || !matches) {
    throw new ApiError("UNAUTHORIZED", "That email/mobile or password is not right.");
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
