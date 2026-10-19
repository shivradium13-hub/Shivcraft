import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { delhiveryNotificationJobs, orders } from "@/server/db/schema";
import { getWhatsappSettings } from "@/server/whatsapp/settings";
import { isLiveMode, orderMessageAlreadySent, sendOrderTemplate } from "@/server/whatsapp/service";

export const MAX_DELHIVERY_ATTEMPTS = 8;

/** Bounded exponential backoff: 1m, 2m, 4m ... capped at 1 hour. */
export function retryDelayMs(attempt: number): number {
  return Math.min(3_600_000, 60_000 * 2 ** Math.max(0, attempt - 1));
}

/**
 * Claim one notification using a DB row lock. The lease lets later workers
 * recover a job after a crashed function. Only the current lease owner should
 * finish it; processing is sequential to minimize parallel Meta sends.
 */
async function claimJob() {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT id FROM delhivery_notification_jobs
      WHERE ((state = 'pending' AND next_attempt_at <= now())
        OR (state = 'processing' AND lease_until < now()))
        AND attempts < ${MAX_DELHIVERY_ATTEMPTS}
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
    const id = rows.rows[0]?.id;
    if (!id) return null;
    const [job] = await tx
      .update(delhiveryNotificationJobs)
      .set({
        state: "processing",
        attempts: sql`${delhiveryNotificationJobs.attempts} + 1`,
        leaseUntil: new Date(Date.now() + 120_000),
        updatedAt: new Date(),
      })
      .where(eq(delhiveryNotificationJobs.id, id))
      .returning();
    return job;
  });
}

async function markJob(id: string, attempt: number, result: "done" | "retry" | "skipped", explanation?: string) {
  await db.update(delhiveryNotificationJobs).set({
    state: result === "retry" ? (attempt >= MAX_DELHIVERY_ATTEMPTS ? "failed" : "pending") : result,
    leaseUntil: null,
    nextAttemptAt: result === "retry" ? new Date(Date.now() + retryDelayMs(attempt)) : new Date(),
    lastError: explanation?.slice(0, 300) ?? null,
    updatedAt: new Date(),
  }).where(and(
    eq(delhiveryNotificationJobs.id, id),
    eq(delhiveryNotificationJobs.state, "processing"),
    eq(delhiveryNotificationJobs.attempts, attempt),
  ));
}

export async function runDelhiveryNotificationWorker(maxJobs = 5) {
  const settings = await getWhatsappSettings();
  if (!settings.enabled || !isLiveMode(settings.enabled)) {
    return { processed: 0, paused: true };
  }

  let processed = 0;
  for (let i = 0; i < Math.min(Math.max(1, maxJobs), 5); i++) {
    const job = await claimJob();
    if (!job) break;
    processed++;
    try {
      const event = job.event;
      const isDelivery = event === "DELIVERED";
      const isOFD = event === "OUT_FOR_DELIVERY";
      if (!isDelivery && !isOFD) {
        await markJob(job.id, job.attempts, "skipped", "Not a supported event");
        continue;
      }
      const enabled = isDelivery ? settings.notifyDelivered : settings.notifyOutForDelivery;
      const template = isDelivery ? settings.templateDelivered : settings.templateOutForDelivery;
      if (!enabled) {
        await markJob(job.id, job.attempts, "skipped", "Notification disabled by admin");
        continue;
      }
      if (!template) {
        await markJob(job.id, job.attempts, "retry", "Approved template not configured");
        continue;
      }
      const [order] = await db.select({
        orderNumber: orders.orderNumber,
        userId: orders.userId,
        phone: orders.shipPhone,
        awb: orders.delhiveryAwb,
        currentStatus: orders.status,
      }).from(orders).where(eq(orders.id, job.orderId)).limit(1);
      if (!order || !order.phone) {
        await markJob(job.id, job.attempts, "skipped", "Order or customer phone unavailable");
        continue;
      }
      if ((isOFD && (order.currentStatus === "CANCELLED" || order.currentStatus === "DELIVERED")) || (isDelivery && order.currentStatus !== "DELIVERED")) {
        await markJob(job.id, job.attempts, "skipped", "Order status no longer matches notification");
        continue;
      }
      if (await orderMessageAlreadySent(job.orderId, template)) {
        await markJob(job.id, job.attempts, "done");
        continue;
      }

      const text = isDelivery
        ? "Your parcel has been delivered."
        : "Your parcel is out for delivery today.";
      const sent = await sendOrderTemplate({
        phone: order.phone,
        template,
        language: settings.templateLang,
        bodyParams: [order.orderNumber, text],
        enabled: settings.enabled,
        userId: order.userId,
        orderId: job.orderId,
        orderNumber: order.orderNumber,
      });
      if (!sent.ok || sent.mock || !sent.logId) {
        await markJob(job.id, job.attempts, "retry", "WhatsApp provider did not confirm acceptance");
        continue;
      }
      await markJob(job.id, job.attempts, "done");
    } catch (error) {
      console.error("[delhivery] notification worker failed", error);
      await markJob(job.id, job.attempts, "retry", "Unexpected notification failure");
    }
  }
  return { processed, paused: false };
}
