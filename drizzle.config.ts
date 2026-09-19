import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Run `vercel env pull .env.local`.");
}

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  casing: "snake_case",
  // Schema changes go through `db:generate` + `db:migrate`, so every change is
  // a reviewable file in git rather than a diff applied straight to the live
  // database. `db:push` is disabled — see scripts/db-push-guard.ts for why.
  //
  // verbose prints the SQL before it runs; strict would additionally prompt for
  // confirmation, which needs a TTY.
  verbose: true,
  strict: false,
});
