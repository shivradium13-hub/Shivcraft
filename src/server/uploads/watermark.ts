import sharp from "sharp";

import type { ImageType } from "./image";
import { WATERMARK_TILE_B64 } from "./watermarkTile";

/**
 * A pre-rendered "Shiv Radium" tile (300×190 transparent PNG), baked once at
 * author time and embedded (as base64, in the generated `watermarkTile` module)
 * so the server never has to rasterise text at request time — SVG text needs
 * system fonts a serverless runtime may not ship, but tiling a ready PNG does
 * not. Tiled across the whole image so a crop cannot remove it.
 */
const WATERMARK_TILE = Buffer.from(WATERMARK_TILE_B64, "base64");

const RASTER: ReadonlySet<string> = new Set<ImageType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Only raster photos can be stamped; videos/SVG/gif are served as-is. */
export function isWatermarkable(contentType: string): contentType is ImageType {
  return RASTER.has(contentType);
}

/**
 * Bakes the Shiv Radium watermark into a product photo, re-encoding in the same
 * format. Returns the original bytes if anything goes wrong, so a problem image
 * never 500s the media route — it just serves unwatermarked.
 */
export async function watermarkImage(input: Buffer, contentType: ImageType): Promise<Buffer> {
  try {
    const pipeline = sharp(input, { failOn: "none" }).composite([
      { input: WATERMARK_TILE, tile: true, blend: "over" },
    ]);
    if (contentType === "image/png") return await pipeline.png().toBuffer();
    if (contentType === "image/webp") return await pipeline.webp().toBuffer();
    return await pipeline.jpeg({ quality: 85 }).toBuffer();
  } catch {
    return input;
  }
}
