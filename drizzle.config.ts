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
  // verbose prints the SQL before it runs; strict would additionally prompt for
  // confirmation, which needs a TTY. Before production, move off `push` to
  // generate + migrate so schema changes are reviewable files in git.
  verbose: true,
  strict: false,
});
