import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/server/db";
import { sessions, users } from "@/server/db/schema";

export const SESSION_COOKIE = "giftcraft_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "USER" | "ADMIN";
};

/**
 * The cookie carries a random 256-bit token; the database stores only its
 * SHA-256. A dump of the sessions table therefore cannot be replayed as a
 * login. Sessions live in the database rather than a JWT so that blocking a
 * user or logging them out takes effect on the very next request.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: userAgent?.slice(0, 400) ?? null,
    expiresAt,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

/** Resolves the signed-in user, or null. Blocked users resolve to null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      isBlocked: users.isBlocked,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || row.isBlocked) return null;

  return { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Drop every session for a user — used when an admin blocks them. */
export async function destroyAllSessionsFor(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
