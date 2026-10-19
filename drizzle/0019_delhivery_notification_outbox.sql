CREATE TABLE "delhivery_notification_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "event" "order_status" NOT NULL,
  "state" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_until" timestamp with time zone,
  "last_error" varchar(300),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delhivery_notification_jobs" ADD CONSTRAINT "delhivery_notification_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "delhivery_jobs_order_event_uq" ON "delhivery_notification_jobs" USING btree ("order_id","event");
--> statement-breakpoint
CREATE INDEX "delhivery_jobs_ready_idx" ON "delhivery_notification_jobs" USING btree ("state","next_attempt_at");
