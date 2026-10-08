ALTER TABLE "orders" ADD COLUMN "shipping_provider" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delhivery_awb" varchar(40);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipment_status" varchar(60);