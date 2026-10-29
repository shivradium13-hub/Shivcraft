/**
 * Delivery quality for catalogue product photos.
 *
 * next/image compresses to quality 75 by default; we raise it so product
 * images render crisp instead of slightly soft. Every product renders through
 * the shared ProductImage / ProductGallery components, so setting this once
 * applies to all products — existing and any added later — automatically.
 *
 * Any value used here MUST also appear in `images.qualities` in next.config.ts:
 * Next 16 requires that allowlist and returns 400 for an unlisted quality.
 *
 * Note: this controls COMPRESSION only. It cannot add detail a low-resolution
 * upload never had — for genuinely sharper images, upload larger originals
 * (the upload pipeline stores them as-is, up to 20 MB, with no downscaling).
 */
export const PRODUCT_IMAGE_QUALITY = 90;
