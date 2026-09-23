import type { CustomerDesign, PhotoPlacement } from "@/lib/customizer/design";
import {
  acrylicMirrorOn,
  isZoneVisible,
  resolveFrameFill,
  resolveGradient,
  resolveTextStyle,
  zonesForView,
  type CustomizerConfig,
  type CustomizerView,
  type CustomizerZone,
} from "@/lib/customizer/schema";

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
 * The customer's photo, placed to cover a box `w` × `h` in user units.
 *
 * The one implementation of the placement maths, shared by the single-zone
 * print file and the composite proof, so the two can never disagree about
 * where a photo sits. Returns a filter definition (empty when nothing was
 * adjusted) and the drawing itself, positioned in local 0..w / 0..h space.
 */
function photoContent(
  idSuffix: string,
  placement: PhotoPlacement,
  w: number,
  h: number,
  asset: ZoneAsset,
): { defs: string; body: string } {
  const p = placement;
  const filter = adjustmentFilter(`adj-${idSuffix}`, p.brightness, p.contrast, p.saturation);

  /* The same order the browser applies: cover the area, scale about the
     centre, rotate about the centre, then move by the stored offset, where
     100% is one box width or height. */
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

  const body = `<g transform="${transform}"${filter.ref}>
      <image x="0" y="0" width="${round(w)}" height="${round(h)}"
        preserveAspectRatio="xMidYMid slice"
        href="data:${asset.contentType};base64,${asset.base64}"/>
    </g>`;

  return { defs: filter.def, body };
}

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
    const content = photoContent(zone.id, value.photo, w, h, asset);
    defs += content.defs;
    body += content.body;
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

export type ResolvedImage = { base64: string; contentType: string } | null;

export type CompositeProof = { svg: string; warnings: string[] };

/**
 * A single-sheet visual proof of the whole finished piece.
 *
 * This is not the print artwork — the per-zone files are, at exact physical
 * size. This is the reference the workshop checks against: the product view
 * with every photo, word and colour choice composited exactly as the customer
 * approved, on one page. It is built from the same placement maths and the
 * same percentage coordinates as the on-screen preview and the per-zone files,
 * so it cannot drift from either.
 *
 * The canvas is square to match the preview, and the product art is drawn
 * "meet" (letterboxed) exactly as `object-contain` does on screen.
 */
export function renderComposite(options: {
  config: CustomizerConfig;
  design: CustomerDesign;
  view: CustomizerView;
  /** Customer photos, by zone id, already fetched from private storage. */
  assets: Map<string, ZoneAsset>;
  base: ResolvedImage;
  overlay: ResolvedImage;
  /** Frame PNGs, by zone id, embedded when available. */
  frameImages?: Map<string, ResolvedImage>;
  /** Square canvas side, in pixels. */
  pxSize?: number;
}): CompositeProof {
  const { config, design, view, assets, base, overlay, frameImages } = options;
  const S = options.pxSize ?? 1600;
  const warnings: string[] = [];

  let defs = "";
  let body = "";

  if (base) {
    body += `<image x="0" y="0" width="${S}" height="${S}" preserveAspectRatio="xMidYMid meet" href="data:${base.contentType};base64,${base.base64}"/>`;
  } else {
    warnings.push(
      "The product background could not be embedded, so this proof shows the customer's content on a plain page. The per-zone print files are unaffected.",
    );
  }

  /* The customer's global styling — the same resolution the preview uses, so
     the proof reproduces the colours, fonts, sizes and gradient they chose. */
  const gradient = resolveGradient(config, design);
  if (gradient) {
    const rad = ((gradient.direction - 90) * Math.PI) / 180;
    const dx = Math.cos(rad) / 2;
    const dy = Math.sin(rad) / 2;
    defs += `<linearGradient id="grad" x1="${round(0.5 - dx)}" y1="${round(0.5 - dy)}" x2="${round(0.5 + dx)}" y2="${round(0.5 + dy)}"><stop offset="0" stop-color="${gradient.color1}"/><stop offset="1" stop-color="${gradient.color2}"/></linearGradient>`;
  }
  if (acrylicMirrorOn(config)) {
    defs += `<filter id="acrylic" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${round(S * 0.0015)}" stdDeviation="${round(S * 0.0012)}" flood-color="#000000" flood-opacity="0.35"/></filter>`;
  }

  /* Only the zones the admin left visible and the customer's choices reveal,
     in the same order the preview draws them. */
  const zones = zonesForView(config, view.id).filter(
    (z) => !z.hidden && isZoneVisible(config, z, design.options),
  );

  for (const zone of zones) {
    const zx = (zone.x / 100) * S;
    const zy = (zone.y / 100) * S;
    const zw = (zone.width / 100) * S;
    const zh = (zone.height / 100) * S;
    const cx = zx + zw / 2;
    const cy = zy + zh / 2;
    const rx = round((zone.cornerRadius / 100) * Math.min(zw, zh));

    const clipId = `clip-${zone.id}`;
    const clipShape =
      zone.shape === "CIRCLE"
        ? `<ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(zw / 2)}" ry="${round(zh / 2)}"/>`
        : `<rect x="${round(zx)}" y="${round(zy)}" width="${round(zw)}" height="${round(zh)}" rx="${rx}"/>`;

    let inner = "";
    let clipped = false;

    if (zone.kind === "FRAME") {
      const img = frameImages?.get(zone.id);
      if (zone.imageUrl && img) {
        inner = `<g transform="translate(${round(zx)} ${round(zy)})"><image x="0" y="0" width="${round(zw)}" height="${round(zh)}" preserveAspectRatio="xMidYMid meet" href="data:${img.contentType};base64,${img.base64}"/></g>`;
        clipped = true;
      } else if (zone.imageUrl) {
        // Not embedded; reference the URL so an online viewer still sees it.
        inner = `<g transform="translate(${round(zx)} ${round(zy)})"><image x="0" y="0" width="${round(zw)}" height="${round(zh)}" preserveAspectRatio="xMidYMid meet" href="${esc(zone.imageUrl)}"/></g>`;
        clipped = true;
      } else {
        const fill = resolveFrameFill(config, zone, design);
        const stroke =
          zone.strokeWidth > 0 && zone.stroke
            ? ` stroke="${zone.stroke}" stroke-width="${round(zone.strokeWidth)}"`
            : "";
        if (fill || stroke) {
          const shape =
            zone.shape === "CIRCLE"
              ? `<ellipse cx="${round(cx)}" cy="${round(cy)}" rx="${round(zw / 2)}" ry="${round(zh / 2)}" fill="${fill ?? "none"}"${stroke}/>`
              : `<rect x="${round(zx)}" y="${round(zy)}" width="${round(zw)}" height="${round(zh)}" rx="${rx}" fill="${fill ?? "none"}"${stroke}/>`;
          inner = shape;
        }
      }
    } else {
      const value = design.zones[zone.id];
      if (!value) continue;

      if (value.kind === "PHOTO" && assets.has(zone.id)) {
        const content = photoContent(zone.id, value.photo, zw, zh, assets.get(zone.id)!);
        defs += content.defs;
        // photoContent draws in local 0..zw / 0..zh space; move it onto the zone.
        inner = `<g transform="translate(${round(zx)} ${round(zy)})">${content.body}</g>`;
        if (gradient?.applyToPhotos) {
          inner += `<rect x="${round(zx)}" y="${round(zy)}" width="${round(zw)}" height="${round(zh)}" fill="url(#grad)" opacity="0.5"/>`;
        }
        clipped = true;
      } else if (value.kind === "PHOTO") {
        warnings.push(`The photo for ${zone.label} could not be embedded in the proof.`);
      } else if (value.kind === "TEXT" && value.text.value.trim()) {
        const style = resolveTextStyle(config, zone, design);
        const sizePx = ((value.text.fontSizePct ?? style.fontSizePct) / 100) * zh;
        const fill = gradient ? "url(#grad)" : value.text.color ?? style.color;
        const family = (value.text.fontFamily ?? style.fontFamily).replace(/"/g, "");
        const align = value.text.align ?? zone.align;
        const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
        const tx = align === "left" ? zx + zw * 0.04 : align === "right" ? zx + zw * 0.96 : cx;
        const lines = value.text.value.split("\n");
        const startY = cy - ((lines.length - 1) * sizePx * 1.15) / 2;
        const tspans = lines
          .map(
            (line, i) =>
              `<tspan x="${round(tx)}" y="${round(startY + i * sizePx * 1.15)}">${esc(line)}</tspan>`,
          )
          .join("");
        const filter = acrylicMirrorOn(config) ? ` filter="url(#acrylic)"` : "";
        inner = `<text font-family="&quot;${esc(family)}&quot;, Georgia, 'Times New Roman', serif" font-size="${round(sizePx)}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="middle"${filter}>${tspans}</text>`;
      }
    }

    if (inner) {
      if (clipped) defs += `<clipPath id="${clipId}">${clipShape}</clipPath>`;
      const wrapped = clipped ? `<g clip-path="url(#${clipId})">${inner}</g>` : inner;
      const rotate = zone.rotation ? ` transform="rotate(${round(zone.rotation)} ${round(cx)} ${round(cy)})"` : "";
      body += `<g${rotate}>${wrapped}</g>`;
    }
  }

  if (overlay) {
    body += `<image x="0" y="0" width="${S}" height="${S}" preserveAspectRatio="xMidYMid meet" href="data:${overlay.contentType};base64,${overlay.base64}"/>`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <title>${esc(view.label)} — proof</title>
  <desc>Shiv Radium proof sheet. A visual reference of the finished piece; the per-zone files are the print artwork.</desc>
  <defs>${defs}</defs>
  <rect x="0" y="0" width="${S}" height="${S}" fill="#ffffff"/>
  ${body}
</svg>`;

  return { svg, warnings };
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
