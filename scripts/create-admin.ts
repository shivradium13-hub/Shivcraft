import { sql } from "drizzle-orm";

import { hashPassword } from "@/server/auth/password";
import { db, schema } from "@/server/db";

/**
 * Creates (or resets) an admin login.
 *
 * Give it an email and a password; it upserts a user with role ADMIN, storing
 * only the scrypt hash of the password — never the plaintext, and the password
 * is never printed back. If a user with that email already exists (e.g. a
 * shopping account) it is upgraded to ADMIN and unblocked, and its password is
 * reset to the one given, so this doubles as a password reset.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/create-admin.ts "<email>" "<password>"
 * or with environment variables:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx --env-file=.env.local scripts/create-admin.ts
 */

const { users } = schema;

async function main() {
  const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? "").trim();
  const password = process.argv[3] ?? process.env.ADMIN_PASSWORD ?? "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Give a valid email:  scripts/create-admin.ts "you@example.com" "your-password"');
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const passwordHash = await hashPassword(password);

  const existing = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({ role: "ADMIN", isBlocked: false, passwordHash })
      .where(sql`${users.id} = ${existing[0].id}`);
    console.log(`✓ Updated existing account to ADMIN and reset its password: ${email}`);
  } else {
    await db.insert(users).values({
      name: "Shop Owner",
      email,
      role: "ADMIN",
      passwordHash,
    });
    console.log(`✓ Created new ADMIN account: ${email}`);
  }

  console.log("  Sign in at /login, then open /admin.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create admin:", err instanceof Error ? err.message : err);
  process.exit(1);
});
