/**
 * Pulls two gradient colours out of an image — a dominant colour and a second,
 * distinct one — by sampling it on a tiny off-screen canvas. Runs entirely in
 * the browser (no upload, no dependency) and only on same-origin image URLs, so
 * the canvas is not tainted and pixels can be read.
 *
 * Near-white / near-black and low-saturation pixels are down-weighted so the
 * gradient picks up the product's real colour (the gold of an acrylic plate)
 * rather than the background.
 */

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** A rough saturation/among-channels spread, 0..255, to weight vivid pixels. */
function vividness(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export async function dominantGradient(src: string): Promise<[string, string] | null> {
  if (typeof document === "undefined") return null;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = src;
  });
  if (!img || !img.naturalWidth) return null;

  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // tainted canvas (cross-origin) — cannot read pixels
  }

  // Bucket colours into a coarse grid and tally a vividness-weighted count.
  const buckets = new Map<string, { r: number; g: number; b: number; w: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const weight = 1 + vividness(r, g, b) / 32;
    const cur = buckets.get(key);
    if (cur) {
      cur.r += r * weight;
      cur.g += g * weight;
      cur.b += b * weight;
      cur.w += weight;
    } else {
      buckets.set(key, { r: r * weight, g: g * weight, b: b * weight, w: weight });
    }
  }
  if (buckets.size === 0) return null;

  const ranked = [...buckets.values()]
    .map((c) => ({ r: Math.round(c.r / c.w), g: Math.round(c.g / c.w), b: Math.round(c.b / c.w), w: c.w }))
    .sort((a, b) => b.w - a.w);

  const first = ranked[0];
  // The second colour is the highest-weighted one that is visibly different from
  // the first, so the gradient actually reads as a gradient.
  const second =
    ranked.find(
      (c) => Math.abs(c.r - first.r) + Math.abs(c.g - first.g) + Math.abs(c.b - first.b) > 60,
    ) ?? darken(first);

  return [toHex(first.r, first.g, first.b), toHex(second.r, second.g, second.b)];
}

/** A darker shade, used when the image is basically one colour. */
function darken(c: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  return { r: Math.round(c.r * 0.55), g: Math.round(c.g * 0.55), b: Math.round(c.b * 0.55) };
}
