import { ok, route } from "@/server/api/http";
import { destroySession } from "@/server/auth/session";

export const runtime = "nodejs";

export const POST = route(async () => {
  await destroySession();
  return ok({ signedOut: true });
});
