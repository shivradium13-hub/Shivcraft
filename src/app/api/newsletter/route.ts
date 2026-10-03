import { z } from "zod";

import { created, readJson, route } from "@/server/api/http";
import { db } from "@/server/db";
import { newsletterSubscribers } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  source: z.string().trim().max(40).optional(),
});

/**
 * POST /api/newsletter — a visitor subscribes (from the storefront promo pop-up).
 *
 * Public, so it only stores an email and nothing sensitive. A repeat email is a
 * no-op (unique index + onConflictDoNothing), and the response is the same either
 * way so the form cannot be used to probe who is already subscribed.
 */
export const POST = route(async (request: Request) => {
  const input = await readJson(request, schema);

  await db
    .insert(newsletterSubscribers)
    .values({ email: input.email, source: input.source || "popup" })
    .onConflictDoNothing({ target: newsletterSubscribers.email });

  return created({ subscribed: true });
});
