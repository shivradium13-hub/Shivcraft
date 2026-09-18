import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

/**
 * We use the WebSocket-backed Neon driver rather than the HTTP one because
 * placing an order must be a real interactive transaction: decrement stock,
 * insert the order, redeem the coupon — all or nothing. The HTTP driver cannot
 * do that, and a half-applied order is how you oversell.
 *
 * Node 22+ ships a global WebSocket, so no `ws` dependency is needed.
 */
if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Run `vercel env pull .env.local` to fetch it from Neon.",
  );
}

/**
 * The pool is cached on globalThis in development so Next's hot reload does not
 * open a new pool on every edit and exhaust Neon's connection limit.
 */
const globalForDb = globalThis as unknown as { __giftcraftPool?: Pool };

const pool = globalForDb.__giftcraftPool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__giftcraftPool = pool;
}

export const db = drizzle(pool, { schema, casing: "snake_case" });

export type Db = typeof db;
export { schema };
