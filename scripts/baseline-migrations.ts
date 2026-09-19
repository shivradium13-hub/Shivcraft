import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Pool, neonConfig } from "@neondatabase/serverless";

/**
 * Records existing migration files as already applied, without running them.
 *
 * This exists because the database was built with `drizzle-kit push` before it
 * had migration files. The generated baseline describes the schema that is
 * already live, so applying it would fail on the first CREATE TABLE. Drizzle
 * decides what to run by comparing timestamps against its own bookkeeping
 * table, so writing the baseline's row there is what makes `db:migrate` agree
 * that there is nothing to do.
 *
 * Run once, on a database whose schema already matches the baseline:
 *
 *   pnpm db:baseline
 *
 * It is safe to re-run: rows are keyed by the migration's timestamp and an
 * already-recorded migration is left alone. It never touches your data, and it
 * never executes a migration — only records one.
 */

if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

type JournalEntry = { idx: number; when: number; tag: string };

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Run `vercel env pull .env.local`.");
  }

  const folder = path.join(process.cwd(), "drizzle");
  const journalPath = path.join(folder, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    throw new Error(`No journal at ${journalPath}. Run \`pnpm db:generate\` first.`);
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: JournalEntry[] };
  if (journal.entries.length === 0) {
    console.log("The journal has no migrations, so there is nothing to baseline.");
    return;
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    /* The same shape drizzle's own migrator creates, so it reads what we write. */
    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);

    for (const entry of journal.entries) {
      const file = path.join(folder, `${entry.tag}.sql`);
      const sql = fs.readFileSync(file, "utf8");
      /* Drizzle hashes the whole file, breakpoint markers included. */
      const hash = crypto.createHash("sha256").update(sql).digest("hex");

      const existing = await client.query(
        `select id, hash from "drizzle"."__drizzle_migrations" where created_at = $1`,
        [entry.when],
      );

      if (existing.rows.length > 0) {
        const matches = existing.rows[0].hash === hash;
        console.log(
          matches
            ? `  already recorded  ${entry.tag}`
            : `  already recorded  ${entry.tag}  — WARNING: the file has changed since it was applied.\n` +
              `                    Edit an applied migration and the database no longer matches it.\n` +
              `                    Write a new migration instead.`,
        );
        continue;
      }

      await client.query(
        `insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)`,
        [hash, entry.when],
      );
      console.log(`  recorded as applied  ${entry.tag}`);
    }

    const { rows } = await client.query(
      `select count(*)::int as n from "drizzle"."__drizzle_migrations"`,
    );
    console.log(`\nDone. ${rows[0].n} migration(s) recorded. \`pnpm db:migrate\` will skip these.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
