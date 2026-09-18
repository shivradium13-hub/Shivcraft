import { ok, route } from "@/server/api/http";
import { getCurrentUser } from "@/server/auth/session";

export const runtime = "nodejs";

/** Returns the signed-in user, or null. Never 401s — the header calls this on
 *  every page and a signed-out visitor is a normal state, not an error. */
export const GET = route(async () => {
  const user = await getCurrentUser();
  return ok({ user });
});
