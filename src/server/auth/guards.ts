import { ApiError } from "@/server/api/http";

import { getCurrentUser, type SessionUser } from "./session";

/**
 * Route guards. Every admin API route must call `requireAdmin()` as its first
 * statement — a USER reaching an admin endpoint is a 403, never a partial
 * result. Section 25: users must never be able to access admin routes.
 */

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "Please sign in to continue.");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "Please sign in to continue.");
  }
  if (user.role !== "ADMIN") {
    // Deliberately the same wording a missing page would give: do not confirm
    // to a probing account that an admin route exists here.
    throw new ApiError("FORBIDDEN", "You do not have access to this area.");
  }
  return user;
}

/** For endpoints that work signed-in or signed-out (cart, product views). */
export async function optionalUser(): Promise<SessionUser | null> {
  return getCurrentUser();
}
