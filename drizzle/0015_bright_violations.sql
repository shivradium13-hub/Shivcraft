ALTER TABLE "products" ADD COLUMN "promo_banners" jsonb;--> statement-breakpoint
-- Backfill: move any existing single promo banner into the new array form.
UPDATE "products"
SET "promo_banners" = jsonb_build_array(
  jsonb_strip_nulls(jsonb_build_object(
    'url', "promo_banner_url",
    'href', "promo_banner_href",
    'label', "promo_banner_label"
  ))
)
WHERE "promo_banner_url" IS NOT NULL AND "promo_banners" IS NULL;