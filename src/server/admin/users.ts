import { and, count, desc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";

import { ApiError } from "@/server/api/http";
import { db } from "@/server/db";
import { addresses, orders, reviews, sessions, users } from "@/server/db/schema";

export type UserRole = "USER" | "ADMIN";
export type UserFilter = "all" | "admins" | "blocked";

/*
 * Nothing in this file ever selects password_hash. It is not needed to manage
 * an account, and a column that is never read cannot leak through a response.
 */

/**
 * Correlated counts are written with the table name spelled out.
 *
 * The outer query has no join, so Drizzle renders a bare `"id"` here, which
 * binds to the SUBQUERY's table and matches nothing — silently, with no error.
 * Writing "users"."id" keeps the correlation pointing where it should.
 */
const orderCount = sql<number>`(
  SELECT count(*)::int FROM orders o WHERE o.user_id = "users"."id"
)`;

const lifetimeSpendP = sql<number>`(
  SELECT coalesce(sum(o.total_p), 0)::int FROM orders o
  WHERE o.user_id = "users"."id" AND o.status <> 'CANCELLED'
)`;

const reviewCount = sql<number>`(
  SELECT count(*)::int FROM reviews r WHERE r.user_id = "users"."id"
)`;

const lastOrderAt = sql<string | null>`(
  SELECT max(o.placed_at) FROM orders o WHERE o.user_id = "users"."id"
)`;

export async function listAdminUsers(options: {
  filter: UserFilter;
  query: string;
  page: number;
  limit: number;
}) {
  const filters: SQL[] = [];

  if (options.filter === "admins") filters.push(eq(users.role, "ADMIN"));
  if (options.filter === "blocked") filters.push(eq(users.isBlocked, true));

  if (options.query) {
    const term = `%${options.query}%`;
    const match = or(ilike(users.name, term), ilike(users.email, term), ilike(users.phone, term));
    if (match) filters.push(match);
  }

  const where = filters.length ? and(...filters) : undefined;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isBlocked: users.isBlocked,
        createdAt: users.createdAt,
        orderCount,
        lifetimeSpendP,
        reviewCount,
        lastOrderAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
    db.select({ total: count() }).from(users).where(where),
  ]);

  return { rows, total: Number(totals[0]?.total ?? 0) };
}

export async function userCounts() {
  const rows = await db
    .select({
      all: count(),
      admins: sql<number>`count(*) FILTER (WHERE ${users.role} = 'ADMIN')::int`,
      blocked: sql<number>`count(*) FILTER (WHERE ${users.isBlocked})::int`,
    })
    .from(users);

  return {
    all: Number(rows[0]?.all ?? 0),
    admins: Number(rows[0]?.admins ?? 0),
    blocked: Number(rows[0]?.blocked ?? 0),
  };
}

export async function getAdminUser(id: string) {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      isBlocked: users.isBlocked,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      orderCount,
      lifetimeSpendP,
      reviewCount,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  const user = rows[0];
  if (!user) return null;

  const [orderRows, addressRows, sessionRows] = await Promise.all([
    db
      .select({
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalP: orders.totalP,
        placedAt: orders.placedAt,
        // Payment status lives on payments, newest row wins. The outer query
        // filters on orders alone, so the correlation is spelled out.
        paymentStatus: sql<string | null>`(
          SELECT p.status FROM payments p
          WHERE p.order_id = "orders"."id"
          ORDER BY p.created_at DESC LIMIT 1
        )`,
      })
      .from(orders)
      .where(eq(orders.userId, id))
      .orderBy(desc(orders.placedAt))
      .limit(10),
    db.select().from(addresses).where(eq(addresses.userId, id)),
    /* Only live sessions, and only the device and expiry — never the token
       hash. Expired rows are filtered by the database rather than after the
       fact, so the page renders the same answer every time. */
    db
      .select({ id: sessions.id, expiresAt: sessions.expiresAt, userAgent: sessions.userAgent })
      .from(sessions)
      .where(and(eq(sessions.userId, id), gt(sessions.expiresAt, sql`now()`)))
      .orderBy(desc(sessions.expiresAt))
      .limit(10),
  ]);

  return { ...user, orders: orderRows, addresses: addressRows, sessions: sessionRows };
}

/**
 * Stops an admin locking the shop, or themselves, out.
 *
 * Both cases are real: blocking your own account ends your session on the very
 * next request, and demoting the only admin leaves nobody who can reach /admin
 * at all. Neither is recoverable from inside the app.
 */
export async function assertRoleChangeAllowed(
  actorId: string,
  targetId: string,
  next: { role?: UserRole; isBlocked?: boolean },
) {
  if (actorId === targetId) {
    if (next.isBlocked === true) {
      throw new ApiError("BAD_REQUEST", "You cannot block your own account — you would be signed out immediately.");
    }
    if (next.role === "USER") {
      throw new ApiError("BAD_REQUEST", "You cannot remove your own admin access.");
    }
  }

  const losingAdmin = next.role === "USER" || next.isBlocked === true;
  if (!losingAdmin) return;

  const target = await db
    .select({ role: users.role, isBlocked: users.isBlocked })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target[0]) throw new ApiError("NOT_FOUND", "That account does not exist.");
  if (target[0].role !== "ADMIN" || target[0].isBlocked) return;

  const remaining = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.isBlocked, false)));

  if (Number(remaining[0]?.n ?? 0) <= 1) {
    throw new ApiError(
      "CONFLICT",
      "This is the only admin account left. Promote someone else first, or nobody will be able to reach the admin area.",
    );
  }
}

/** Orders are RESTRICTed against user deletes, so this explains rather than
 *  letting a foreign-key error reach the screen. */
export async function assertUserDeletable(id: string) {
  const rows = await db.select({ n: count() }).from(orders).where(eq(orders.userId, id));
  const n = Number(rows[0]?.n ?? 0);

  if (n > 0) {
    throw new ApiError(
      "CONFLICT",
      `This customer has ${n} ${n === 1 ? "order" : "orders"}. Deleting the account would take that history with it — block the account instead.`,
    );
  }

  const reviewRows = await db.select({ n: count() }).from(reviews).where(eq(reviews.userId, id));
  return { reviews: Number(reviewRows[0]?.n ?? 0) };
}

/** Ends every session this user has. */
export async function revokeSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
