import { z } from "zod";

import { ApiError, created, readJson, route } from "@/server/api/http";
import { db } from "@/server/db";
import { newsletterSubscribers } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  source: z.string().trim().max(40).optional(),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise an Indian mobile number to 10 digits, or null if it is not one. */
function normalisePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/**
 * POST /api/newsletter — a visitor subscribes with an email, a mobile number, or
 * both (from the storefront promo pop-up).
 *
 * Public, so it only stores a contact and nothing sensitive. A repeat is a no-op
 * (unique indexes + onConflictDoNothing), and the response is the same either way
 * so the form cannot be used to probe who is already subscribed.
 */
export const POST = route(async (request: Request) => {
  const input = await readJson(request, schema);

  const rawEmail = (input.email ?? "").trim().toLowerCase();
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : null;
  if (rawEmail && !email) throw new ApiError("BAD_REQUEST", "Enter a valid email address.");

  const phone = input.phone ? normalisePhone(input.phone) : null;
  if (input.phone && input.phone.trim() && !phone) {
    throw new ApiError("BAD_REQUEST", "Enter a valid 10-digit mobile number.");
  }

  if (!email && !phone) {
    throw new ApiError("BAD_REQUEST", "Enter your email or mobile number.");
  }

  await db
    .insert(newsletterSubscribers)
    .values({ email, phone, source: input.source || "popup" })
    .onConflictDoNothing();

  return created({ subscribed: true });
});
