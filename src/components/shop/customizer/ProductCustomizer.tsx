"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatPaise } from "@/lib/money";
import {
  emptyDesign,
  type CustomerDesign,
  type PhotoPlacement,
} from "@/lib/customizer/design";
import { zonesForView, type CustomizerConfig, type CustomizerZone } from "@/lib/customizer/schema";

import { CustomizerCanvas } from "./CustomizerCanvas";
import { usePhotoGestures } from "./usePhotoGestures";

/**
 * The customer's customiser.
 *
 * Holds one design, renders it through CustomizerCanvas, and hands it to the
 * cart. Everything order-critical — whether the design is complete, what it
 * costs — is re-decided by the server on add to cart; this component's job is
 * to make that outcome obvious before the customer gets there (§48).
 *
 * The interface stays deliberately plain: pick a zone, put a photo in it, nudge
 * it. The engine underneath is general, but the customer is personalising a
 * gift, not operating an editor (§50).
 */

type Props = {
  productId: string;
  productName: string;
  config: CustomizerConfig;
  basePriceP: number;
  onDesignChange?: (design: CustomerDesign) => void;
};

const MAX_HISTORY = 40;

export function ProductCustomizer({
  productId,
  productName,
  config,
  basePriceP,
  onDesignChange,
}: Props) {
  const storageKey = `sr:design:${productId}:v${config.version}`;
  const firstView = config.views[0]?.id ?? "";

  const [design, setDesign] = useState<CustomerDesign>(() => restore(storageKey, config.version) ?? emptyDesign(config.version, firstView));
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [restored, setRestored] = useState(() => restore(storageKey, config.version) !== null);
  const [fullscreen, setFullscreen] = useState(false);

  /* State, not refs: the Undo and Redo buttons read these to decide whether
     they are available, and a ref would leave them frozen at their first
     value because changing one does not re-render. */
  const [history, setHistory] = useState<CustomerDesign[]>([]);
  const [future, setFuture] = useState<CustomerDesign[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const zones = useMemo(() => zonesForView(config, design.viewId), [config, design.viewId]);
  const activeZone = zones.find((z) => z.id === activeZoneId) ?? zones[0] ?? null;
  const activeValue = activeZone ? design.zones[activeZone.id] : undefined;
  const activePhoto = activeValue?.kind === "PHOTO" ? activeValue.photo : null;

  /* ---------------------------------------------------------- persistence */

  useEffect(() => {
    onDesignChange?.(design);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(design));
    } catch {
      /* Not being able to save a draft must never break editing. */
    }
  }, [design, storageKey, onDesignChange]);

  /* -------------------------------------------------------------- history */

  /** Records the step being replaced, so undo walks back one real change. */
  const commit = useCallback((next: CustomerDesign) => {
    setDesign((prev) => {
      setHistory((h) => [...h, prev].slice(-MAX_HISTORY));
      setFuture([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setDesign((prev) => {
        setFuture((f) => [prev, ...f].slice(0, MAX_HISTORY));
        return last;
      });
      return h.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const [next, ...rest] = f;
      setDesign((prev) => {
        setHistory((h) => [...h, prev].slice(-MAX_HISTORY));
        return next;
      });
      return rest;
    });
  }, []);

  /* ---------------------------------------------------------- zone edits */

  /** `live` is a drag in progress: the design updates but no history entry is
   *  added, so one undo steps back the whole gesture rather than one frame. */
  const setPhoto = useCallback(
    (zoneId: string, patch: Partial<PhotoPlacement>, live = false) => {
      setDesign((prev) => {
        const current = prev.zones[zoneId];
        if (current?.kind !== "PHOTO") return prev;
        if (!live) {
          setHistory((h) => [...h, prev].slice(-MAX_HISTORY));
          setFuture([]);
        }
        return {
          ...prev,
          zones: {
            ...prev.zones,
            [zoneId]: { kind: "PHOTO", photo: { ...current.photo, ...patch } },
          },
        };
      });
    },
    [],
  );

  const setText = useCallback(
    (zoneId: string, value: string) => {
      setDesign((prev) => ({
        ...prev,
        zones: { ...prev.zones, [zoneId]: { kind: "TEXT", text: { value } } },
      }));
    },
    [],
  );

  const gestures = usePhotoGestures({
    placement: activePhoto,
    enabled: Boolean(activeZone && activePhoto),
    onChange: (patch) => {
      if (activeZone) setPhoto(activeZone.id, patch, true);
    },
  });

  /* --------------------------------------------------------------- upload */

  async function upload(file: File, zone: CustomizerZone) {
    setUploading(true);
    setNotice(null);
    try {
      const size = await readImageSize(file);

      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const json = await res.json();

      if (!res.ok) {
        setNotice(json?.error?.message ?? "That photo did not upload. Please try again.");
        return;
      }

      commit({
        ...design,
        zones: {
          ...design.zones,
          [zone.id]: {
            kind: "PHOTO",
            photo: {
              uploadId: json.data.id,
              offsetX: 0,
              offsetY: 0,
              /* Orientation-aware start: a photo whose shape differs from the
                 zone is scaled to cover it, so the customer never opens on a
                 picture with empty bars beside it (§10). */
              scale: startingScale(size, zone),
              rotation: 0,
              flipH: false,
              flipV: false,
              naturalWidth: size?.width ?? null,
              naturalHeight: size?.height ?? null,
            },
          },
        },
      });
    } catch {
      setNotice("The upload did not finish — check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* ---------------------------------------------------------------- price */

  const personalised = Object.keys(design.zones).length > 0;
  const totalP = basePriceP + (personalised ? config.customizationFeeP : 0);

  const quality = activeZone && activePhoto ? localQuality(activeZone, activePhoto) : null;

  /* Progress over the zones this product actually requires, so a text-only
     product does not show a photo step it has no use for (§22). */
  const steps = config.zones
    .filter((z) => z.required && config.views.some((v) => v.zoneIds.includes(z.id)))
    .map((z) => {
      const value = design.zones[z.id];
      const done =
        value?.kind === "PHOTO"
          ? Boolean(value.photo.uploadId)
          : value?.kind === "TEXT"
            ? value.text.value.trim().length > 0
            : false;
      return { id: z.id, label: z.label, done };
    });
  const remaining = steps.filter((s) => !s.done).length;

  /* ----------------------------------------------------------------- view */

  return (
    <section className="rounded-card border border-brand-200 bg-brand-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-brand-800">Personalise it</h2>
        {config.tools.undoRedo ? (
          <div className="flex gap-1.5">
            <Small onClick={undo} disabled={history.length === 0}>
              Undo
            </Small>
            <Small onClick={redo} disabled={future.length === 0}>
              Redo
            </Small>
          </div>
        ) : null}
      </div>

      {restored ? (
        <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
          We kept the design you started earlier.{" "}
          <button
            type="button"
            onClick={() => {
              commit(emptyDesign(config.version, firstView));
              setRestored(false);
            }}
            className="font-semibold text-brand-700 underline"
          >
            Start again
          </button>
        </p>
      ) : null}

      {/* ----------------------------------------------------------- canvas */}
      <div
        className="mt-3 rounded-card border border-line bg-paper p-2"
        {...gestures.handlers}
      >
        <CustomizerCanvas
          config={config}
          design={design}
          viewId={design.viewId}
          activeZoneId={activeZone?.id ?? null}
          interactive
          showGuides
          onZoneSelect={setActiveZoneId}
        />
      </div>

      {config.views.length > 1 ? (
        <div className="gc-hide-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {config.views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setDesign((prev) => ({ ...prev, viewId: view.id }))}
              aria-pressed={design.viewId === view.id}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                design.viewId === view.id
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-line-strong bg-paper text-ink-soft hover:border-brand-400"
              }`}
            >
              {view.label}
            </button>
          ))}
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveZoneId(step.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                step.done ? "bg-brand-50 text-brand-700" : "bg-paper text-muted ring-1 ring-line-strong"
              }`}
            >
              {step.done ? "✓ " : ""}
              {step.label}
            </button>
          ))}
          <span className="text-[11px] text-muted">
            {remaining === 0 ? "Ready to add to cart" : `${remaining} left`}
          </span>
        </div>
      ) : null}

      {config.tools.fullscreenPreview && Object.keys(design.zones).length > 0 ? (
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="mt-2 w-full rounded-lg border border-line-strong bg-paper px-4 py-2 text-xs font-semibold text-ink-soft transition hover:border-brand-400"
        >
          Preview your design
        </button>
      ) : null}

      {config.colorNotice ? (
        <p className="mt-2 text-[11px] text-muted">
          Colours on your screen may vary slightly from the printed product.
        </p>
      ) : null}

      {/* ------------------------------------------------------------ zones */}
      {zones.length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => setActiveZoneId(zone.id)}
              aria-pressed={activeZone?.id === zone.id}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                activeZone?.id === zone.id
                  ? "border-brand-600 text-brand-700"
                  : "border-line-strong text-ink-soft"
              }`}
            >
              {zone.label}
              {design.zones[zone.id] ? " ✓" : zone.required ? " *" : ""}
            </button>
          ))}
        </div>
      ) : null}

      {activeZone ? (
        <div className="mt-3">
          {activeZone.kind === "PHOTO" ? (
            <>
              {config.tools.photoUpload ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file, activeZone);
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                  >
                    {uploading
                      ? "Uploading photo…"
                      : activePhoto
                        ? `Replace photo in ${activeZone.label}`
                        : `Upload photo for ${activeZone.label}`}
                  </button>
                </>
              ) : null}

              {activePhoto ? (
                <>
                  <p className="mt-2 text-center text-[11px] text-muted">
                    Drag the photo to move it. Pinch, or hold ⌘/Ctrl and scroll, to zoom.
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                    {config.tools.zoom ? (
                      <>
                        <Small onClick={() => setPhoto(activeZone.id, { scale: activePhoto.scale * 1.1 })}>
                          Zoom in
                        </Small>
                        <Small onClick={() => setPhoto(activeZone.id, { scale: activePhoto.scale / 1.1 })}>
                          Zoom out
                        </Small>
                      </>
                    ) : null}
                    {config.tools.rotate ? (
                      <Small
                        onClick={() =>
                          setPhoto(activeZone.id, {
                            rotation: normaliseAngle(activePhoto.rotation + 90),
                          })
                        }
                      >
                        Rotate
                      </Small>
                    ) : null}
                    {config.tools.flip ? (
                      <Small onClick={() => setPhoto(activeZone.id, { flipH: !activePhoto.flipH })}>
                        Flip
                      </Small>
                    ) : null}
                    <Small
                      onClick={() =>
                        setPhoto(activeZone.id, { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 })
                      }
                    >
                      Recentre
                    </Small>
                  </div>

                  {quality ? (
                    <p
                      className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${
                        quality.tone === "bad"
                          ? "bg-danger-soft text-danger"
                          : quality.tone === "warn"
                            ? "bg-soft text-warn"
                            : "bg-paper text-ink-soft"
                      }`}
                    >
                      {quality.message}
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-ink">
                {activeZone.label}
                {activeZone.required ? <span className="text-danger"> *</span> : null}
              </span>
              <input
                value={activeValue?.kind === "TEXT" ? activeValue.text.value : ""}
                maxLength={activeZone.maxChars ?? 120}
                onChange={(e) => setText(activeZone.id, e.target.value)}
                placeholder={activeZone.defaultText || "Type here"}
                className="w-full rounded-lg border border-field bg-field-bg px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
              {activeZone.maxChars ? (
                <span className="text-[11px] text-muted">
                  {(activeValue?.kind === "TEXT" ? activeValue.text.value.length : 0)} of{" "}
                  {activeZone.maxChars} characters
                </span>
              ) : null}
            </label>
          )}
        </div>
      ) : null}

      {notice ? (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {notice}
        </p>
      ) : null}

      {fullscreen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your design"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/90 p-4"
          onClick={() => setFullscreen(false)}
        >
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            {/* No guides and no drag handles: this is the product, not the
                editor (§23). */}
            <CustomizerCanvas config={config} design={design} viewId={design.viewId} />
          </div>

          {config.views.length > 1 ? (
            <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
              {config.views.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setDesign((prev) => ({ ...prev, viewId: view.id }))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    design.viewId === view.id
                      ? "border-white bg-white text-ink"
                      : "border-white/40 text-white"
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Close preview
          </button>
        </div>
      ) : null}

      {config.customizationFeeP > 0 ? (
        <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          <Row label={productName}>{formatPaise(basePriceP)}</Row>
          <Row label="Personalisation">
            {personalised ? formatPaise(config.customizationFeeP) : "—"}
          </Row>
          <Row label="Total" strong>
            {formatPaise(totalP)}
          </Row>
        </dl>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------- helpers */

/**
 * A draft kept from an earlier visit.
 *
 * Keyed by configuration version, so a design built against an older layout is
 * never dropped onto a new one. Read in the state initialiser rather than an
 * effect, which this component can do because it is mounted client-only — there
 * is no server render for it to disagree with.
 */
function restore(key: string, version: number): CustomerDesign | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomerDesign;
    return parsed?.configVersion === version && parsed.zones ? parsed : null;
  } catch {
    return null;
  }
}

function Row({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold text-ink" : "text-ink-soft"}`}>
      <dt className="min-w-0 truncate">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Small({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-brand-400 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function normaliseAngle(angle: number) {
  const wrapped = ((angle + 180) % 360 + 360) % 360 - 180;
  return wrapped;
}

/** Reads a picture's real pixel size in the browser so the starting zoom and
 *  the quality hint are based on the file, not on a guess. */
async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Scale that makes the photo cover the zone rather than sit inside it. */
function startingScale(size: { width: number; height: number } | null, zone: CustomizerZone) {
  if (!size || size.width === 0 || size.height === 0) return 1;
  const photoRatio = size.width / size.height;
  const zoneRatio = zone.width / zone.height;
  return photoRatio > zoneRatio ? photoRatio / zoneRatio : zoneRatio / photoRatio;
}

/** The same arithmetic the server uses, mirrored here only so the customer
 *  sees the verdict while editing. The server's answer is the one that counts. */
function localQuality(zone: CustomizerZone, photo: PhotoPlacement) {
  if (!zone.printWidthMm || !zone.printHeightMm || !photo.naturalWidth || !photo.naturalHeight) {
    return null;
  }
  const scale = Math.max(0.1, photo.scale);
  const dpi = Math.round(
    Math.min(
      photo.naturalWidth / scale / (zone.printWidthMm / 25.4),
      photo.naturalHeight / scale / (zone.printHeightMm / 25.4),
    ),
  );

  if (dpi >= zone.minDpi * 1.5) return { tone: "ok" as const, message: "Excellent quality for this size." };
  if (dpi >= zone.minDpi) return { tone: "ok" as const, message: "Good quality for this size." };
  if (dpi >= zone.minDpi * 0.6) {
    return {
      tone: "warn" as const,
      message: "This photo may look a little soft at this size. Zooming out, or a larger photo, will sharpen it.",
    };
  }
  return {
    tone: "bad" as const,
    message: "Your photo may appear blurry when printed. Please upload a higher-resolution photo.",
  };
}
