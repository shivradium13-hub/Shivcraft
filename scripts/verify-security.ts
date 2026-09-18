/**
 * Asserts the credential-storage invariants that section 25 requires.
 * Run with:  pnpm verify:security
 *
 * This is a guard, not a report: it exits non-zero if anything regressed, so it
 * can sit in CI.
 */

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

type Row = Record<string, string | number>;

async function main() {
  let failures = 0;
  const fail = (message: string) => {
    console.error("  ✗ " + message);
    failures++;
  };

  const users = await db.execute<Row>(sql`
    SELECT email, role,
           left(password_hash, 28) AS prefix,
           length(password_hash) AS len
    FROM users ORDER BY role, email`);

  console.log("\nAccounts");
  for (const u of users.rows) {
    console.log(`   ${u.role.toString().padEnd(5)} ${u.email}  ${u.prefix}…  (${u.len} chars)`);
  }

  const storage = await db.execute<Row>(sql`
    SELECT
      count(*) FILTER (WHERE password_hash LIKE 'scrypt$%')     AS hashed,
      count(*) FILTER (WHERE password_hash NOT LIKE 'scrypt$%') AS not_hashed,
      count(*) FILTER (WHERE length(password_hash) < 60)        AS suspiciously_short
    FROM users`);
  const s = storage.rows[0];

  console.log("\nPassword storage");
  console.log(`   scrypt-hashed: ${s.hashed}`);
  if (Number(s.not_hashed) > 0) fail(`${s.not_hashed} password(s) are not scrypt hashes`);
  if (Number(s.suspiciously_short) > 0) fail(`${s.suspiciously_short} hash(es) look truncated`);
  if (Number(s.not_hashed) === 0 && Number(s.suspiciously_short) === 0) {
    console.log("   ✓ no plaintext or truncated passwords");
  }

  const sessions = await db.execute<Row>(sql`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE length(token_hash) <> 64) AS wrong_length,
           count(*) FILTER (WHERE token_hash !~ '^[0-9a-f]{64}$') AS not_sha256
    FROM sessions`);
  const t = sessions.rows[0];

  console.log("\nSessions");
  console.log(`   rows: ${t.total} (each stores a SHA-256 of the cookie token, never the token)`);
  if (Number(t.wrong_length) > 0) fail(`${t.wrong_length} session(s) have a non-64-char token hash`);
  if (Number(t.not_sha256) > 0) fail(`${t.not_sha256} session(s) do not look like hex SHA-256`);
  if (Number(t.wrong_length) === 0 && Number(t.not_sha256) === 0) {
    console.log("   ✓ every session stores a hash, not a replayable token");
  }

  const admins = await db.execute<Row>(sql`SELECT count(*) AS n FROM users WHERE role = 'ADMIN'`);
  console.log(`\nAdmins: ${admins.rows[0].n}`);
  if (Number(admins.rows[0].n) === 0) fail("no admin account exists — run pnpm db:seed");

  console.log(failures === 0 ? "\n✓ All credential checks passed\n" : `\n✗ ${failures} check(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
