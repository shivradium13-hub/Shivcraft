ALTER TABLE "newsletter_subscribers" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_phone_unique" UNIQUE("phone");