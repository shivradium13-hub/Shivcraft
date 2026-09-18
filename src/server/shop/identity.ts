import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { getCurrentUser, type SessionUser } from "@/server/auth/session";

export const GUEST_COOKIE = "giftcraft_guest";
const GUEST_DAYS = 90;

export type Shopper = {
  user: SessionUser | null;
  /** Present for signed-out visitors so a cart and its uploads survive until
   *  they sign in. Null when the visitor is signed in. */
  guestToken: string | null;
};

/**
 * Read-only: safe from Server Components. Returns whatever identity the
 * request already carries and never issues a cookie.
 */
export async function readShopper(): Promise<Shopper> {
  const user = await getCurrentUser();
  if (user) return { user, guestToken: null };

  const jar = await cookies();
  return { user: null, guestToken: jar.get(GUEST_COOKIE)?.value ?? null };
}

/**
 * Issues a guest cookie when there isn't one. Setting a cookie is only allowed
 * in Route Handlers and Server Actions, so this must not be called while a
 * Server Component is rendering — use readShopper() there.
 */
export async function ensureShopper(): Promise<Shopper> {
  const user = await getCurrentUser();
  if (user) return { user, guestToken: null };

  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value;
  if (existing) return { user: null, guestToken: existing };

  const token = randomBytes(24).toString("base64url");
  jar.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_DAYS * 24 * 60 * 60,
  });
  return { user: null, guestToken: token };
}

/** True when this request may read the given upload row. */
export function ownsUpload(
  shopper: Shopper,
  row: { userId: string | null; guestToken: string | null },
): boolean {
  if (shopper.user?.role === "ADMIN") return true;
  if (shopper.user && row.userId) return row.userId === shopper.user.id;
  if (shopper.guestToken && row.guestToken) return row.guestToken === shopper.guestToken;
  return false;
}
