import type { CustomerDesign } from "@/lib/customizer/design";
import type { CustomizerConfig, CustomizerZone } from "@/lib/customizer/schema";

/**
 * Print-ready output for a customised order.
 *
 * A screenshot of the preview is not a print file — the preview is a few
 * hundred pixels wide, and a 150mm photo area at 300dpi is 1772. So the output
 * is built from the frozen design and the customer's untouched original (§34).
 *
 * The file is an SVG, and deliberately so:
 *
 *   - it declares its real size in millimetres, so a printer opens it at the
 *     physical dimensions the zone was configured with
 *   - the customer's photo is embedded exactly as uploaded, so nothing is
 *     resampled or re-encoded on the way out
 *   - it is resolution independent, so the shop rasterises at whatever their
 *     press wants rather than at whatever we guessed
 *   - text stays text, so it can be reset in the right font rather than
 *     arriving as pixels
 *
 * It is also exact rather than approximate. `preserveAspectRatio="slice"` is
 * the same rule as CSS `object-fit: cover`, and the CSS filter functions the
 * preview uses are themselves specified in terms of the SVG filter primitives
 * below — so this reproduces what the customer approved by definition, not by
 * a second implementation of the same maths.
 */

/** One millimetre, in the user units this document draws in. */
const UNITS_PER_MM = 10;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export type ZoneAsset = {
  zoneId: string;
  /** The original file, base64, exactly as the customer uploaded it. */
  base64: string;
  contentType: string;
};

/**
 * The filter that reproduces the customer's brightness, contrast and
 * saturation. Omitted entirely when nothing was adjusted, so an untouched
 * photo passes through with no colour pipeline at all.
 */
function adjustmentFilter(id: string, brightness: number, contrast: number, saturation: number) {
  if (brightness === 100 && contrast === 100 && saturation === 100) return { def: "", ref: "" };

  const b = brightness / 100;
  const c = contrast / 100;
  const intercept = 0.5 - c * 0.5;

  const def = `<filter id="${id}" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="${round(saturation / 100)}"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="${round(b)}"/>
        <feFuncG type="linear" slope="${round(b)}"/>
        <feFuncB type="linear" slope="${round(b)}"/>
      </feComponentTransfer>
      <feComponentTransfer>
        <feFuncR type="linear" slope="${round(c)}" intercept="${round(intercept)}"/>
        <feFuncG type="linear" slope="${round(c)}" intercept="${round(intercept)}"/>
        <feFuncB type="linear" slope="${round(c)}" intercept="${round(intercept)}"/>
      </feComponentTransfer>
    </filter>`;

  return { def, ref: ` filter="url(#${id})"` };
}

export type ProductionFile = {
  svg: string;
  widthMm: number;
  heightMm: number;
  /** Zones that could not be included, and why — reported, never silent. */
  warnings: string[];
};

/**
 * One photo zone as a print file at its configured physical size.
 *
 * This is what a print shop actually wants: the artwork for one area, at the
 * size it prints, with the crop the customer chose already applied.
 */
export function renderZoneFile(options: {
  zone: CustomizerZone;
  design: CustomerDesign;
  asset: ZoneAsset | null;
}): ProductionFile {
  const { zone, design, asset } = options;
  const warnings: string[] = [];

  const widthMm = zone.printWidthMm ?? 100;
  const heightMm = zone.printHeightMm ?? 100;
  if (zone.printWidthMm == null || zone.printHeightMm == null) {
    warnings.push(
      `${zone.label} has no print size configured, so this file is 100 x 100mm. Set the print size on the product to get the real dimensions.`,
    );
  }

  const w = widthMm * UNITS_PER_MM;
  const h = heightMm * UNITS_PER_MM;

  const value = design.zones[zone.id];
  let body = "";
  let defs = "";

  if (value?.kind === "PHOTO" && asset) {
    const p = value.photo;
    const filter = adjustmentFilter(`adj-${zone.id}`, p.brightness, p.contrast, p.saturation);
    defs += filter.def;

    /* The same order the browser applies: cover the area, scale about the
       centre, rotate about the centre, then move by the stored offset, where
       100% is one zone width or height. */
    const offX = (p.offsetX / 100) * w;
    const offY = (p.offsetY / 100) * h;
    const flipX = p.flipH ? -1 : 1;
    const flipY = p.flipV ? -1 : 1;

    const transform = [
      `translate(${round(w / 2 + offX)} ${round(h / 2 + offY)})`,
      `rotate(${round(p.rotation)})`,
      `scale(${round(p.scale * flipX)} ${round(p.scale * flipY)})`,
      `translate(${round(-w / 2)} ${round(-h / 2)})`,
    ].join(" ");

    body += `<g transform="${transform}"${filter.ref}>
      <image x="0" y="0" width="${round(w)}" height="${round(h)}"
        preserveAspectRatio="xMidYMid slice"
        href="data:${asset.contentType};base64,${asset.base64}"/>
    </g>`;
  } else if (value?.kind === "PHOTO") {
    warnings.push(`The original photo for ${zone.label} could not be read from storage.`);
  } else {
    warnings.push(`${zone.label} has no photo in it.`);
  }

  /* The margin printing is guaranteed to reach, drawn on its own layer so the
     shop can delete it. Not part of the artwork. */
  const inset = (zone.safeInset / 100) * Math.min(w, h);
  const guide =
    zone.safeInset > 0
      ? `<g id="safe-area" data-print="false">
      <rect x="${round(inset)}" y="${round(inset)}" width="${round(w - inset * 2)}" height="${round(h - inset * 2)}"
        fill="none" stroke="#ff00ff" stroke-width="2" stroke-dasharray="12 8"/>
    </g>`
      : "";

  const clip =
    zone.shape === "CIRCLE"
      ? `<clipPath id="zone-clip"><ellipse cx="${round(w / 2)}" cy="${round(h / 2)}" rx="${round(w / 2)}" ry="${round(h / 2)}"/></clipPath>`
      : `<clipPath id="zone-clip"><rect x="0" y="0" width="${round(w)}" height="${round(h)}" rx="${round((zone.cornerRadius / 100) * Math.min(w, h))}"/></clipPath>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${round(w)} ${round(h)}">
  <title>${esc(zone.label)}</title>
  <desc>Shiv Radium production artwork. Physical size ${widthMm} x ${heightMm} mm. The photo is the customer's original, placed with the crop they approved.</desc>
  <defs>${clip}${defs}</defs>
  <g clip-path="url(#zone-clip)">${body}</g>
  ${guide}
</svg>`;

  return { svg, widthMm, heightMm, warnings };
}

/** Which zones of a design have a photo that needs fetching. */
export function photoZonesOf(
  config: CustomizerConfig,
  design: CustomerDesign,
): { zone: CustomizerZone; uploadId: string }[] {
  return config.zones.flatMap((zone) => {
    const value = design.zones[zone.id];
    return zone.kind === "PHOTO" && value?.kind === "PHOTO"
      ? [{ zone, uploadId: value.photo.uploadId }]
      : [];
  });
}

/**
 * Whether the original carries enough detail for the size it will print at.
 *
 * Reported, not enforced: a shop may knowingly print a soft photo, and
 * refusing to produce the file would not help them decide.
 */
export function renderQuality(
  zone: CustomizerZone,
  naturalWidth: number | null,
  scale: number,
): { effectiveDpi: number | null; sufficient: boolean } {
  if (!naturalWidth || zone.printWidthMm == null) return { effectiveDpi: null, sufficient: true };
  const usable = naturalWidth / Math.max(0.1, scale);
  const effectiveDpi = Math.round(usable / (zone.printWidthMm / 25.4));
  return { effectiveDpi, sufficient: effectiveDpi >= zone.minDpi };
}
