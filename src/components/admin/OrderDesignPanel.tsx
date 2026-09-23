"use client";

import { useState } from "react";

import { readStoredDesign } from "@/lib/customizer/design";
import { readConfig } from "@/lib/customizer/schema";
import { CustomizerCanvas } from "@/components/shop/customizer/CustomizerCanvas";

/**
 * What the workshop needs in order to actually make a customised item.
 *
 * Rendered from the snapshot frozen at checkout — the design AND the
 * configuration it was built against — so this shows what the customer
 * approved, not what the product happens to look like today (§32, §33).
 *
 * The originals are linked at full resolution rather than shown only as a
 * thumbnail, because a preview is not a print file: the whole point of storing
 * a transform instead of a re-crop is that the untouched photo is still there.
 */
export function OrderDesignPanel({
  raw,
  lineLabel,
  orderNumber,
  itemId,
}: {
  raw: unknown;
  lineLabel: string;
  orderNumber: string;
  itemId: string;
}) {
  const [showData, setShowData] = useState(false);

  const stored = readStoredDesign(raw);
  if (!stored) return null;

  const config = readConfig(stored.config);
  const { design } = stored;

  const photos = Object.entries(design.zones).flatMap(([zoneId, value]) =>
    value.kind === "PHOTO" ? [{ zoneId, photo: value.photo }] : [],
  );
  const texts = Object.entries(design.zones).flatMap(([zoneId, value]) =>
    value.kind === "TEXT" ? [{ zoneId, text: value.text }] : [],
  );

  const zoneLabel = (id: string) => config.zones.find((z) => z.id === id)?.label ?? id;

  return (
    <div className="mt-2.5 rounded-lg border border-sr-line bg-sr-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-sr-700 uppercase">
          Personalised design
        </p>
        <span className="text-[11px] text-sr-muted">
          Built against customizer version {design.configVersion}
        </span>
      </div>

      {config.enabled && config.views.length > 0 ? (
        <a
          href={`/api/admin/orders/${orderNumber}/production?item=${itemId}&sheet=${design.viewId}`}
          download
          className="mt-2 inline-flex rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400"
        >
          Download full proof sheet
        </a>
      ) : null}

      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        {/* What the customer approved, rendered from the frozen configuration. */}
        {config.enabled && config.views.length > 0 ? (
          <div>
            <CustomizerCanvas config={config} design={design} viewId={design.viewId} />
            <p className="mt-1 text-center text-[11px] text-sr-muted">Customer&rsquo;s preview</p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-field bg-sr-surface p-4 text-xs text-sr-muted">
            This order was placed before configurations were frozen onto orders, so it cannot be
            re-rendered here. The values below are the complete record of what was ordered.
          </p>
        )}

        <div className="grid gap-3">
          {texts.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold text-sr-muted uppercase">Text</p>
              <dl className="mt-1 grid gap-1">
                {texts.map(({ zoneId, text }) => (
                  <div key={zoneId} className="flex flex-wrap gap-2 text-sm">
                    <dt className="text-sr-muted">{zoneLabel(zoneId)}:</dt>
                    <dd className="font-semibold text-sr-ink">{text.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {photos.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold text-sr-muted uppercase">
                Customer photos — originals, full resolution
              </p>
              <ul className="mt-2 grid gap-2">
                {photos.map(({ zoneId, photo }) => (
                  <li
                    key={zoneId}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-sr-line bg-sr-surface p-2"
                  >
                    {/* Private upload, served through the proxy that checks the
                        viewer — readable here because this viewer is an admin. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/uploads/${photo.uploadId}`}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-md border border-sr-line object-cover"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-semibold text-sr-ink">{zoneLabel(zoneId)}</p>
                      <p className="text-sr-muted">
                        {photo.naturalWidth && photo.naturalHeight
                          ? `${photo.naturalWidth} × ${photo.naturalHeight}px`
                          : "Size not recorded"}
                        {" · "}
                        zoom {photo.scale.toFixed(2)}×, offset {photo.offsetX.toFixed(1)}% /{" "}
                        {photo.offsetY.toFixed(1)}%, rotation {photo.rotation}°
                        {photo.flipH ? ", flipped" : ""}
                      </p>
                    </div>
                    <span className="flex shrink-0 gap-1.5">
                      <a
                        href={`/api/uploads/${photo.uploadId}`}
                        download
                        className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400"
                      >
                        Original
                      </a>
                      {/* The artwork at its real physical size, with the crop
                          already applied. This is the file to send to press. */}
                      <a
                        href={`/api/admin/orders/${orderNumber}/production?item=${itemId}&zone=${zoneId}`}
                        download
                        className="rounded-lg bg-sr-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sr-700"
                      >
                        Print file
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <button
              type="button"
              onClick={() => setShowData((v) => !v)}
              className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
            >
              {showData ? "Hide" : "Show"} full design data
            </button>
            {showData ? (
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-sr-line bg-sr-surface p-3 text-[11px] leading-relaxed text-sr-body">
                {JSON.stringify({ line: lineLabel, design, config }, null, 2)}
              </pre>
            ) : null}
          </div>

          <p className="text-[11px] text-sr-muted">
            Placement is stored as a transform, not a re-crop, so the originals above are untouched.
            Reproduce the crop by applying the zoom, offset and rotation to the printable area of
            each zone.
          </p>
        </div>
      </div>
    </div>
  );
}
