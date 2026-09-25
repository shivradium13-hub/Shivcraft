"use client";

import { useCallback, useRef, useState } from "react";

import { emptyDesign, type CustomerDesign } from "@/lib/customizer/design";
import {
  ACRYLIC_FINISHES,
  EMPTY_CONFIG,
  type CustomizerConfig,
  type CustomizerOptionGroup,
  type CustomizerTemplate,
  type CustomizerView,
  type CustomizerZone,
  type VisibilityRule,
} from "@/lib/customizer/schema";
import { CustomizerCanvas } from "@/components/shop/customizer/CustomizerCanvas";
import { CustomizerFonts } from "@/components/shop/customizer/CustomizerFonts";
import { ProductCustomizer } from "@/components/shop/customizer/ProductCustomizer";

/**
 * The admin's customizer builder.
 *
 * Its preview is the customer's renderer — the same CustomizerCanvas, fed the
 * same configuration document. There is no second implementation that could
 * drift, so what the admin positions here is what the customer will drag
 * against.
 *
 * Zones are dragged into place on the preview rather than typed as
 * coordinates. Numbers are there too, for precision, but nobody should have to
 * guess where 26% down the image lands.
 */

const input =
  "w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";

/* Fallbacks so a partial edit always writes a complete effect object, even for a
   zone from an older draft that predates these fields. */
const SHADOW_DEFAULT = { enabled: false, inset: false, color: "#000000", opacity: 45, blur: 6, offsetX: 0, offsetY: 4 };
const GRADIENT_DEFAULT = { enabled: false, color1: "#ff6b2c", color2: "#151b39", angle: 135, opacity: 60 };
const ACRYLIC_DEFAULT = { enabled: false, finish: "gold" as const };

type Tab = "views" | "zones" | "options" | "customer" | "templates" | "tools";

export function CustomizerBuilder({
  productId,
  productName,
  initial,
  productImages,
  basePriceP = 0,
}: {
  productId: string;
  productName: string;
  initial: CustomizerConfig;
  productImages: string[];
  basePriceP?: number;
}) {
  const [config, setConfigRaw] = useState<CustomizerConfig>(
    initial.views.length > 0 ? initial : withStarterView(initial, productImages[0] ?? ""),
  );

  /* Undo/redo history and a saved/unsaved flag. Every edit flows through
     `setConfig`, so wrapping it here records history and marks the design dirty
     for the whole builder in one place — no call site has to remember to. */
  const [past, setPast] = useState<CustomizerConfig[]>([]);
  const [future, setFuture] = useState<CustomizerConfig[]>([]);
  const [dirty, setDirty] = useState(false);

  const setConfig = useCallback(
    (action: CustomizerConfig | ((prev: CustomizerConfig) => CustomizerConfig)) => {
      setConfigRaw((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        setPast((p) => [...p, prev].slice(-80));
        setFuture([]);
        setDirty(true);
        return next;
      });
    },
    [],
  );

  function undo() {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([config, ...future].slice(0, 80));
    setConfigRaw(prev);
    setDirty(true);
  }

  function redo() {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past, config].slice(-80));
    setConfigRaw(next);
    setDirty(true);
  }

  const [tab, setTab] = useState<Tab>("views");
  const [viewId, setViewId] = useState(() => initial.views[0]?.id ?? "front");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    zoneId: string;
    mode: "move" | "resize" | "rotate";
    startX: number;
    startY: number;
    zx: number;
    zy: number;
    zw: number;
    zh: number;
    zr: number;
    /** Zone centre in screen pixels, for rotation. */
    cx: number;
    cy: number;
  } | null>(null);

  const view = config.views.find((v) => v.id === viewId) ?? config.views[0];
  const zone = config.zones.find((z) => z.id === selectedZone) ?? null;

  /* A design with every zone filled by placeholder content, so the admin can
     see where things land before any customer has uploaded anything. */
  const previewDesign: CustomerDesign = {
    ...emptyDesign(config.version, view?.id ?? ""),
    zones: Object.fromEntries(
      config.zones
        .filter((z) => z.kind === "TEXT")
        .map((z) => [z.id, { kind: "TEXT" as const, text: { value: z.defaultText || z.label } }]),
    ),
  };

  const patchZone = useCallback(
    (zoneId: string, patch: Partial<CustomizerZone>) => {
      setConfig((prev) => ({
        ...prev,
        zones: prev.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)),
      }));
    },
    [setConfig],
  );

  const patchView = useCallback(
    (id: string, patch: Partial<CustomizerView>) => {
      setConfig((prev) => ({
        ...prev,
        views: prev.views.map((v) => (v.id === id ? { ...v, ...patch } : v)),
      }));
    },
    [setConfig],
  );

  /* ------------------------------------------------------------- dragging */

  /** Inner canvas box (surface minus its 0.5rem padding), which is the frame
   *  the percentage coordinates are measured against. */
  function innerBox() {
    const box = surface.current?.getBoundingClientRect();
    if (!box) return null;
    return { left: box.left + 8, top: box.top + 8, width: box.width - 16, height: box.height - 16 };
  }

  function onPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    z: CustomizerZone,
    mode: "move" | "resize" | "rotate",
  ) {
    if (z.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedZone(z.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const b = innerBox();
    const cx = b ? b.left + (b.width * (z.x + z.width / 2)) / 100 : 0;
    const cy = b ? b.top + (b.height * (z.y + z.height / 2)) / 100 : 0;
    drag.current = {
      zoneId: z.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      zx: z.x,
      zy: z.y,
      zw: z.width,
      zh: z.height,
      zr: z.rotation,
      cx,
      cy,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const b = innerBox();
    if (!state || !b) return;
    const target = config.zones.find((z) => z.id === state.zoneId);
    if (!target) return;

    if (state.mode === "rotate") {
      const now = (Math.atan2(event.clientY - state.cy, event.clientX - state.cx) * 180) / Math.PI;
      const start = (Math.atan2(state.startY - state.cy, state.startX - state.cx) * 180) / Math.PI;
      let r = state.zr + (now - start);
      r = (((r + 180) % 360) + 360) % 360 - 180;
      patchZone(state.zoneId, { rotation: round(r) });
      return;
    }

    const dx = ((event.clientX - state.startX) / b.width) * 100;
    const dy = ((event.clientY - state.startY) / b.height) * 100;

    if (state.mode === "resize") {
      patchZone(state.zoneId, {
        width: round(clamp(state.zw + dx, 3, 100 - state.zx)),
        height: round(clamp(state.zh + dy, 3, 100 - state.zy)),
      });
    } else {
      patchZone(state.zoneId, {
        x: round(clamp(state.zx + dx, 0, 100 - target.width)),
        y: round(clamp(state.zy + dy, 0, 100 - target.height)),
      });
    }
  }

  function endDrag() {
    drag.current = null;
  }

  /* ---------------------------------------------------------------- save */

  async function save(enabled: boolean) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}/customizer`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...config, enabled }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error?.message ?? "Those settings could not be saved.");
        return;
      }
      setConfigRaw(json.data.config);
      setDirty(false);
      setNotice(
        enabled
          ? `Published as version ${json.data.config.version}. Orders already placed keep the version they were made with.`
          : "Saved and switched off. Customers see this as a normal product.",
      );
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm(`Remove customisation from ${productName}? Existing orders keep their designs.`)) {
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/admin/products/${productId}/customizer`, { method: "DELETE" });
      setConfig(withStarterView(EMPTY_CONFIG, productImages[0] ?? ""));
      setNotice("Customisation removed. This is a normal product again.");
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------------------------------------------- view */

  return (
    <div className="grid gap-4">
      {/* ----------------------------------------------------- top controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-sr-line bg-sr-surface p-2.5">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold text-sr-body">
          <span className="shrink-0 text-sr-muted">Template name</span>
          <input
            className={`${input} min-w-0 flex-1`}
            value={config.templateName}
            placeholder={productName}
            onChange={(e) => setConfig((prev) => ({ ...prev, templateName: e.target.value }))}
          />
        </label>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              // Start a fresh blank template. Undoable, so it is safe.
              setConfig(withStarterView(EMPTY_CONFIG, productImages[0] ?? ""));
              setSelectedZone(null);
            }}
            className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
            title="Start a fresh blank template (Undo restores it)"
          >
            + New template
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={past.length === 0}
            className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body disabled:opacity-40"
          >
            Redo
          </button>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              dirty ? "bg-warn/10 text-warn" : "bg-success-soft text-success"
            }`}
          >
            {dirty ? "Unsaved changes" : "All saved"}
          </span>
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            disabled={!view}
            className="rounded-lg bg-sr-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sr-700 disabled:opacity-40"
          >
            Preview customer experience
          </button>
        </div>
      </div>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
      {/* ------------------------------------------------------- preview */}
      <div className="lg:sticky lg:top-4">
        <div
          ref={surface}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative rounded-card border border-sr-line bg-sr-surface p-2"
          style={{ touchAction: "none" }}
        >
          {view ? (
            <CustomizerCanvas
              config={config}
              design={previewDesign}
              viewId={view.id}
              activeZoneId={selectedZone}
              showGuides
            />
          ) : (
            <p className="p-8 text-center text-sm text-sr-muted">Add a view to begin.</p>
          )}

          {/* Handles sit over the canvas so the admin moves the real zone
              rather than a separate drawing that could disagree with it.
              Hidden zones are not shown; locked zones show but cannot be moved. */}
          {view
            ? config.zones
                .filter((z) => view.zoneIds.includes(z.id) && !z.hidden)
                .map((z) => {
                  const isSel = selectedZone === z.id;
                  return (
                    <div
                      key={z.id}
                      style={{
                        left: `calc(${z.x}% + 0.5rem)`,
                        top: `calc(${z.y}% + 0.5rem)`,
                        width: `${z.width}%`,
                        height: `${z.height}%`,
                        transform: z.rotation ? `rotate(${z.rotation}deg)` : undefined,
                      }}
                      className="absolute"
                    >
                      <div
                        onPointerDown={(e) => onPointerDown(e, z, "move")}
                        onClick={() => setSelectedZone(z.id)}
                        className={`absolute inset-0 rounded ${
                          z.locked ? "cursor-not-allowed" : "cursor-move"
                        } ${
                          // Text areas carry no outline — just the text — so the
                          // canvas stays clean; other areas show a select ring.
                          z.kind === "TEXT"
                            ? ""
                            : isSel
                              ? "ring-2 ring-sr-600"
                              : z.locked
                                ? "ring-1 ring-sr-line-strong"
                                : "ring-1 ring-sr-400/60"
                        }`}
                        title={z.locked ? `${z.label} (locked)` : `Drag ${z.label}`}
                      />
                      {isSel && !z.locked ? (
                        <>
                          {/* Resize, bottom-right. */}
                          <div
                            onPointerDown={(e) => onPointerDown(e, z, "resize")}
                            className="absolute -right-1.5 -bottom-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-white bg-sr-600 shadow"
                            title="Resize"
                          />
                          {/* Rotate, above the top edge. */}
                          <div
                            onPointerDown={(e) => onPointerDown(e, z, "rotate")}
                            className="absolute -top-6 left-1/2 h-3.5 w-3.5 -translate-x-1/2 cursor-grab rounded-full border-2 border-white bg-sr-600 shadow"
                            title="Rotate"
                          />
                        </>
                      ) : null}
                    </div>
                  );
                })
            : null}
        </div>

        <p className="mt-2 text-xs text-sr-muted">
          Drag to move. Select an area to resize (corner) or rotate (top handle). Use the numbers on
          the right for exact placement.
        </p>

        {config.views.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {config.views.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewId(v.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  v.id === view?.id
                    ? "border-sr-600 bg-sr-600 text-white"
                    : "border-sr-line-strong text-sr-body"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------- controls */}
      <div>
        <div className="flex flex-wrap gap-1.5">
          {(["views", "zones", "options", "customer", "templates", "tools"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize ${
                tab === t ? "border-sr-600 bg-sr-600 text-white" : "border-sr-line-strong text-sr-body"
              }`}
            >
              {t === "views"
                ? "Product views"
                : t === "zones"
                  ? "Editable areas"
                  : t === "options"
                    ? "Variants & price"
                    : t === "customer"
                      ? "Customer options"
                      : t === "templates"
                        ? "Templates"
                        : "Customer tools"}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-card border border-sr-line bg-sr-surface p-4">
          {tab === "views" ? (
            <ViewsTab
              config={config}
              productImages={productImages}
              onPatch={patchView}
              onAdd={() =>
                setConfig((prev) => ({
                  ...prev,
                  views: [
                    ...prev.views,
                    {
                      id: `view-${prev.views.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
                      label: `View ${prev.views.length + 1}`,
                      base: productImages[0] ?? "",
                      overlay: "",
                      glow: "",
                      zoneIds: [],
                      isLit: false,
                    },
                  ],
                }))
              }
              onRemove={(id) =>
                setConfig((prev) => ({ ...prev, views: prev.views.filter((v) => v.id !== id) }))
              }
            />
          ) : null}

          {tab === "zones" ? (
            <ZonesTab
              config={config}
              view={view ?? null}
              selected={zone}
              onSelect={setSelectedZone}
              onPatch={patchZone}
              onAdd={(kind) => {
                const id = `${kind.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;
                const created: CustomizerZone = {
                  id,
                  kind,
                  label: kind === "PHOTO" ? "Photo" : kind === "TEXT" ? "Text" : "Frame",
                  shape: "RECT",
                  x: kind === "FRAME" ? 12 : 25,
                  y: kind === "FRAME" ? 12 : 25,
                  width: kind === "FRAME" ? 76 : 50,
                  height: kind === "PHOTO" ? 40 : kind === "TEXT" ? 10 : 76,
                  rotation: 0,
                  cornerRadius: 0,
                  safeInset: kind === "PHOTO" ? 4 : 0,
                  // A frame is decoration, not something the customer must fill.
                  required: kind !== "FRAME",
                  hidden: false,
                  locked: false,
                  // A new frame follows the customer's frame colour by default,
                  // so the "frame colour" option is meaningful straight away.
                  fill: kind === "FRAME" ? "#151b39" : null,
                  stroke: null,
                  strokeWidth: 0,
                  imageUrl: "",
                  tintByFrameColor: kind === "FRAME",
                  visibleWhen: null,
                  printWidthMm: kind === "PHOTO" ? 150 : null,
                  printHeightMm: kind === "PHOTO" ? 100 : null,
                  minDpi: 150,
                  maxChars: kind === "TEXT" ? 30 : null,
                  defaultText: "",
                  fontFamily: "Inter",
                  fontSizePct: 55,
                  color: "#0f121f",
                  align: "center",
                  shadow: { enabled: false, inset: false, color: "#000000", opacity: 45, blur: 6, offsetX: 0, offsetY: 4 },
                  gradient: { enabled: false, color1: "#ff6b2c", color2: "#151b39", angle: 135, opacity: 60 },
                  maskUrl: "",
                  acrylicMirror: { enabled: false, finish: "gold" },
                };
                setConfig((prev) => ({
                  ...prev,
                  zones: [...prev.zones, created],
                  views: prev.views.map((v) =>
                    v.id === (view?.id ?? "")
                      ? {
                          ...v,
                          // A frame defaults to the bottom of the stack so a
                          // filled frame sits behind the photos rather than
                          // hiding them; other elements go on top.
                          zoneIds: kind === "FRAME" ? [id, ...v.zoneIds] : [...v.zoneIds, id],
                        }
                      : v,
                  ),
                }));
                setSelectedZone(id);
              }}
              onRemove={(id) =>
                setConfig((prev) => ({
                  ...prev,
                  zones: prev.zones.filter((z) => z.id !== id),
                  views: prev.views.map((v) => ({
                    ...v,
                    zoneIds: v.zoneIds.filter((z) => z !== id),
                  })),
                }))
              }
              productImages={productImages}
              onReorder={(id, dir) =>
                setConfig((prev) => ({
                  ...prev,
                  views: prev.views.map((v) => {
                    if (v.id !== (view?.id ?? "")) return v;
                    const ids = [...v.zoneIds];
                    const i = ids.indexOf(id);
                    // Layers are drawn bottom-first, so "up" (towards the front)
                    // is later in the array.
                    const j = dir === "up" ? i + 1 : i - 1;
                    if (i < 0 || j < 0 || j >= ids.length) return v;
                    [ids[i], ids[j]] = [ids[j], ids[i]];
                    return { ...v, zoneIds: ids };
                  }),
                }))
              }
            />
          ) : null}

          {tab === "options" ? <OptionsTab config={config} onChange={setConfig} /> : null}

          {tab === "customer" ? (
            <CustomerOptionsTab config={config} onChange={setConfig} />
          ) : null}

          {tab === "templates" ? <TemplatesTab config={config} onChange={setConfig} /> : null}

          {tab === "tools" ? <ToolsTab config={config} onChange={setConfig} /> : null}
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">
            {notice}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => save(true)}
            className="rounded-lg bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Publish for customers"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save(false)}
            className="rounded-lg border border-sr-line-strong px-5 py-2.5 text-sm font-semibold text-sr-body disabled:opacity-60"
          >
            Save, keep switched off
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={clearAll}
            className="rounded-lg border border-danger px-5 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60"
          >
            Remove customisation
          </button>
        </div>
      </div>
    </div>

      {/* --------------------------------------------- customer preview */}
      {previewing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Customer preview"
          className="fixed inset-0 z-50 flex flex-col bg-ink/80 p-3 sm:p-6"
          onClick={() => setPreviewing(false)}
        >
          <div
            className="mx-auto flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-card bg-canvas"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <div>
                <p className="text-sm font-semibold text-ink">Customer preview</p>
                <p className="text-[11px] text-muted">Exactly what the customer sees. Unsaved.</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewing(false)}
                className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft"
              >
                Close
              </button>
            </div>

            <div className="gc-hide-scrollbar flex flex-wrap gap-1.5 border-b border-line px-4 py-2 text-[10px] font-semibold text-muted">
              {["Upload photo", "Enter text", "Adjust photo", "Live preview", "Add to cart"].map(
                (step, i) => (
                  <span key={step} className="rounded-full bg-paper px-2 py-0.5 ring-1 ring-line">
                    {i + 1}. {step}
                  </span>
                ),
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* Loads the allowed fonts so the preview shows them, and renders
                  the real customer component against the unsaved config. */}
              <CustomizerFonts config={config} />
              {config.views.length > 0 ? (
                <ProductCustomizer
                  key={config.version}
                  productId={productId}
                  productName={productName}
                  config={{ ...config, enabled: true }}
                  basePriceP={basePriceP}
                  signedIn={false}
                />
              ) : (
                <p className="text-sm text-muted">Add a view to preview.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ tabs */

/**
 * The admin-controlled background for a view: pick a product image, upload a
 * new one, or leave it blank. The customer never changes this — it is the
 * fixed base the template and their content sit on.
 */
function ViewBackground({
  view,
  productImages,
  onPatch,
}: {
  view: CustomizerView;
  productImages: string[];
  onPatch: (id: string, patch: Partial<CustomizerView>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.url) {
        setError(json?.error?.message ?? "That image did not upload.");
        return;
      }
      onPatch(view.id, { base: json.data.url });
    } catch {
      setError("Upload failed — check your connection.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Field label="Background image" hint="What the customer's content sits on. The customer can't change it.">
      <select
        className={input}
        value={view.base}
        onChange={(e) => onPatch(view.id, { base: e.target.value })}
      >
        <option value="">Blank</option>
        {productImages.map((url, i) => (
          <option key={`${url}-${i}`} value={url}>
            {url.split("/").pop()}
          </option>
        ))}
        {view.base && !productImages.includes(view.base) ? (
          <option value={view.base}>Uploaded background</option>
        ) : null}
      </select>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "Upload background"}
        </button>
        <button
          type="button"
          onClick={() => onPatch(view.id, { base: "" })}
          className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
        >
          Blank
        </button>
      </div>
      {error ? <p className="mt-1 text-[11px] text-danger">{error}</p> : null}
    </Field>
  );
}

function ViewsTab({
  config,
  productImages,
  onPatch,
  onAdd,
  onRemove,
}: {
  config: CustomizerConfig;
  productImages: string[];
  onPatch: (id: string, patch: Partial<CustomizerView>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-sr-muted">
        Each view is one angle or state — Front, Back, Light off, Light on. The customer switches
        between them and their design follows.
      </p>

      {config.views.map((view) => (
        <div key={view.id} className="rounded-lg border border-sr-line p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label">
              <input
                className={input}
                value={view.label}
                onChange={(e) => onPatch(view.id, { label: e.target.value })}
              />
            </Field>
            <ViewBackground view={view} productImages={productImages} onPatch={onPatch} />
            <Field label="Overlay" hint="Sits above the photo, e.g. a frame. Optional.">
              <select
                className={input}
                value={view.overlay}
                onChange={(e) => onPatch(view.id, { overlay: e.target.value })}
              >
                <option value="">None</option>
                {productImages.map((url, i) => (
                  <option key={`${url}-${i}`} value={url}>
                    {url.split("/").pop()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Glow layer" hint="Blended as light. For LED products.">
              <select
                className={input}
                value={view.glow}
                onChange={(e) => onPatch(view.id, { glow: e.target.value })}
              >
                <option value="">None</option>
                {productImages.map((url, i) => (
                  <option key={`${url}-${i}`} value={url}>
                    {url.split("/").pop()}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-sr-body">
              <input
                type="checkbox"
                checked={view.isLit}
                onChange={(e) => onPatch(view.id, { isLit: e.target.checked })}
              />
              This is the lit state
            </label>
            {config.views.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemove(view.id)}
                className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger"
              >
                Remove view
              </button>
            ) : null}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="rounded-lg border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body"
      >
        Add a view
      </button>
    </div>
  );
}

function ZonesTab({
  config,
  view,
  selected,
  onSelect,
  onPatch,
  onAdd,
  onRemove,
  onReorder,
  productImages,
}: {
  config: CustomizerConfig;
  view: CustomizerView | null;
  selected: CustomizerZone | null;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<CustomizerZone>) => void;
  onAdd: (kind: "PHOTO" | "TEXT" | "FRAME") => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, dir: "up" | "down") => void;
  productImages: string[];
}) {
  const inView = view ? config.zones.filter((z) => view.zoneIds.includes(z.id)) : [];
  // Layers are drawn bottom-first; show them front-to-back like a design tool.
  const layers = view
    ? view.zoneIds
        .map((id) => config.zones.find((z) => z.id === id))
        .filter((z): z is CustomizerZone => Boolean(z))
        .reverse()
    : [];

  const kindLabel = (k: CustomizerZone["kind"]) =>
    k === "PHOTO" ? "Image box" : k === "TEXT" ? "Text box" : "Frame";

  return (
    <div className="grid gap-4">
      <p className="text-sm text-sr-muted">
        Place image boxes, text boxes and frames on {view?.label ?? "this view"}. Drag to move;
        select to resize or rotate. The layers list on the right sets what sits in front.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {inView.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => onSelect(z.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              selected?.id === z.id ? "border-sr-600 text-sr-700" : "border-sr-line-strong text-sr-body"
            }`}
          >
            {z.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onAdd("PHOTO")}
          className="rounded-full border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
        >
          + Image box
        </button>
        <button
          type="button"
          onClick={() => onAdd("TEXT")}
          className="rounded-full border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
        >
          + Text box
        </button>
        <button
          type="button"
          onClick={() => onAdd("FRAME")}
          className="rounded-full border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
        >
          + Frame
        </button>
      </div>

      {/* Layers: show/hide, lock, and stacking order, like a design tool. */}
      {layers.length > 0 ? (
        <div className="rounded-lg border border-sr-line p-2.5">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-sr-muted uppercase">
            Layers ({layers.length})
          </p>
          <ul className="grid gap-1">
            {layers.map((z, i) => (
              <li
                key={z.id}
                className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 ${
                  selected?.id === z.id ? "bg-sr-50" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPatch(z.id, { hidden: !z.hidden })}
                  title={z.hidden ? "Show" : "Hide"}
                  aria-label={z.hidden ? `Show ${z.label}` : `Hide ${z.label}`}
                  className="text-sm"
                >
                  {z.hidden ? "🚫" : "👁"}
                </button>
                <button
                  type="button"
                  onClick={() => onPatch(z.id, { locked: !z.locked })}
                  title={z.locked ? "Unlock" : "Lock"}
                  aria-label={z.locked ? `Unlock ${z.label}` : `Lock ${z.label}`}
                  className="text-sm"
                >
                  {z.locked ? "🔒" : "🔓"}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(z.id)}
                  className={`flex-1 truncate text-left text-xs font-medium ${
                    z.hidden ? "text-sr-muted line-through" : "text-sr-body"
                  }`}
                >
                  {z.label} <span className="text-sr-muted">· {kindLabel(z.kind)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(z.id, "up")}
                  disabled={i === 0}
                  title="Bring forward"
                  className="rounded px-1 text-xs text-sr-body disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(z.id, "down")}
                  disabled={i === layers.length - 1}
                  title="Send backward"
                  className="rounded px-1 text-xs text-sr-body disabled:opacity-30"
                >
                  ▼
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selected ? (
        <div className="grid gap-3 rounded-lg border border-sr-line p-3 sm:grid-cols-2">
          <Field label="Label" hint="What the customer is asked for.">
            <input
              className={input}
              value={selected.label}
              onChange={(e) => onPatch(selected.id, { label: e.target.value })}
            />
          </Field>
          {/* Shape (rectangle / circle) is meaningless for a text area, so it
              only shows for image boxes and frames. */}
          {selected.kind !== "TEXT" ? (
            <Field label="Shape">
              <select
                className={input}
                value={selected.shape}
                onChange={(e) => onPatch(selected.id, { shape: e.target.value as "RECT" | "CIRCLE" })}
              >
                <option value="RECT">Rectangle</option>
                <option value="CIRCLE">Circle</option>
              </select>
            </Field>
          ) : null}

          <Num label="Left %" value={selected.x} onChange={(v) => onPatch(selected.id, { x: v })} />
          <Num label="Top %" value={selected.y} onChange={(v) => onPatch(selected.id, { y: v })} />
          <Num label="Width %" value={selected.width} onChange={(v) => onPatch(selected.id, { width: v })} />
          <Num label="Height %" value={selected.height} onChange={(v) => onPatch(selected.id, { height: v })} />

          {selected.kind === "PHOTO" ? (
            <>
              <Num
                label="Print width (mm)"
                value={selected.printWidthMm ?? 0}
                onChange={(v) => onPatch(selected.id, { printWidthMm: v || null })}
              />
              <Num
                label="Print height (mm)"
                value={selected.printHeightMm ?? 0}
                onChange={(v) => onPatch(selected.id, { printHeightMm: v || null })}
              />
              <Field label="Minimum DPI" hint="Below this the customer is warned.">
                <input
                  type="number"
                  className={input}
                  value={selected.minDpi}
                  onChange={(e) => onPatch(selected.id, { minDpi: Number(e.target.value) || 150 })}
                />
              </Field>
              <div className="sm:col-span-2">
                <MediaUploadField
                  label="Custom shape / clipping mask (PNG)"
                  hint="The customer's photo is clipped to this shape's alpha. Leave empty to use the Rectangle/Circle shape above."
                  value={selected.maskUrl}
                  onChange={(url) => onPatch(selected.id, { maskUrl: url })}
                  accept="image/png,image/webp"
                />
              </div>
            </>
          ) : selected.kind === "TEXT" ? (
            <>
              <Field label="Maximum characters">
                <input
                  type="number"
                  className={input}
                  value={selected.maxChars ?? 30}
                  onChange={(e) => onPatch(selected.id, { maxChars: Number(e.target.value) || null })}
                />
              </Field>
              <Num
                label="Text size (% of area height)"
                value={selected.fontSizePct}
                onChange={(v) => onPatch(selected.id, { fontSizePct: v })}
              />
              <Field label="Default text colour" hint="Used if you don't allow text colours.">
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-field bg-field-bg"
                  value={selected.color}
                  onChange={(e) => onPatch(selected.id, { color: e.target.value })}
                />
              </Field>
              <div className="grid gap-2 rounded-lg border border-sr-line p-2.5 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-sr-ink">
                  <input
                    type="checkbox"
                    checked={selected.acrylicMirror?.enabled ?? false}
                    onChange={(e) =>
                      onPatch(selected.id, {
                        acrylicMirror: { ...ACRYLIC_DEFAULT, ...selected.acrylicMirror, enabled: e.target.checked },
                      })
                    }
                  />
                  Acrylic mirror text (3D metallic finish)
                </label>
                {selected.acrylicMirror?.enabled ? (
                  <Field label="Finish">
                    <select
                      className={input}
                      value={selected.acrylicMirror?.finish ?? "gold"}
                      onChange={(e) =>
                        onPatch(selected.id, {
                          acrylicMirror: {
                            ...ACRYLIC_DEFAULT,
                            ...selected.acrylicMirror,
                            finish: e.target.value as CustomizerZone["acrylicMirror"]["finish"],
                          },
                        })
                      }
                    >
                      {ACRYLIC_FINISHES.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>
            </>
          ) : (
            /* FRAME: a decorative shape or PNG the customer never edits. */
            <>
              <label className="flex items-center gap-2 text-sm text-sr-body sm:col-span-2">
                <input
                  type="checkbox"
                  checked={selected.tintByFrameColor}
                  onChange={(e) => onPatch(selected.id, { tintByFrameColor: e.target.checked })}
                />
                Follows the customer’s chosen frame colour
              </label>
              <Field label="Fill colour" hint={selected.tintByFrameColor ? "Fallback if no frame colour is chosen." : undefined}>
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-field bg-field-bg"
                  value={selected.fill ?? "#151b39"}
                  onChange={(e) => onPatch(selected.id, { fill: e.target.value })}
                />
              </Field>
              <Field label="Border colour">
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-field bg-field-bg"
                  value={selected.stroke ?? "#000000"}
                  onChange={(e) => onPatch(selected.id, { stroke: e.target.value })}
                />
              </Field>
              <Num
                label="Border width (px)"
                value={selected.strokeWidth}
                onChange={(v) => onPatch(selected.id, { strokeWidth: v })}
              />
              <Num
                label="Corner radius %"
                value={selected.cornerRadius}
                onChange={(v) => onPatch(selected.id, { cornerRadius: v })}
              />
              <div className="sm:col-span-2">
                <MediaUploadField
                  label="Frame image (JPG / PNG)"
                  hint="A transparent PNG overrides the fill and sits over the customer's content."
                  value={selected.imageUrl}
                  onChange={(url) => onPatch(selected.id, { imageUrl: url })}
                />
              </div>
              <div className="sm:col-span-2">
                <MediaUploadField
                  label="Mockup clipping mask (PNG)"
                  hint="Clips the frame image to this shape's alpha — leave empty for none."
                  value={selected.maskUrl}
                  onChange={(url) => onPatch(selected.id, { maskUrl: url })}
                  accept="image/png,image/webp"
                />
              </div>
              <Field label="Frame image URL (optional)" hint="Or paste a URL instead of uploading.">
                <input
                  className={input}
                  placeholder="Image URL"
                  value={selected.imageUrl}
                  onChange={(e) => onPatch(selected.id, { imageUrl: e.target.value })}
                />
              </Field>
              {productImages.length > 0 ? (
                <div className="sm:col-span-2">
                  <p className="mb-1 text-[11px] text-sr-muted">Or pick a product image:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {productImages.map((url, i) => (
                      <button
                        key={`${url}-${i}`}
                        type="button"
                        onClick={() => onPatch(selected.id, { imageUrl: url })}
                        className={`h-10 w-10 overflow-hidden rounded border ${
                          selected.imageUrl === url ? "border-sr-600 ring-1 ring-sr-600" : "border-sr-line-strong"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                    {selected.imageUrl ? (
                      <button
                        type="button"
                        onClick={() => onPatch(selected.id, { imageUrl: "" })}
                        className="rounded border border-sr-line-strong px-2 text-[11px] font-semibold text-sr-body"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {/* -------- Shadow: this element's own, independent of every other. */}
          <div className="grid gap-2 rounded-lg border border-sr-line p-2.5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-sr-ink">
              <input
                type="checkbox"
                checked={selected.shadow?.enabled ?? false}
                onChange={(e) =>
                  onPatch(selected.id, { shadow: { ...SHADOW_DEFAULT, ...selected.shadow, enabled: e.target.checked } })
                }
              />
              Shadow
            </label>
            {selected.shadow?.enabled ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Type" hint={selected.kind === "TEXT" ? "Inner = engraved look." : undefined}>
                  <select
                    className={input}
                    value={selected.shadow?.inset ? "inner" : "outer"}
                    onChange={(e) =>
                      onPatch(selected.id, {
                        shadow: { ...SHADOW_DEFAULT, ...selected.shadow, inset: e.target.value === "inner" },
                      })
                    }
                  >
                    <option value="outer">Outer</option>
                    <option value="inner">Inner</option>
                  </select>
                </Field>
                <Field label="Colour">
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg border border-field bg-field-bg"
                    value={selected.shadow?.color ?? "#000000"}
                    onChange={(e) =>
                      onPatch(selected.id, { shadow: { ...SHADOW_DEFAULT, ...selected.shadow, color: e.target.value } })
                    }
                  />
                </Field>
                <Num
                  label="Opacity %"
                  value={selected.shadow?.opacity ?? 45}
                  onChange={(v) => onPatch(selected.id, { shadow: { ...SHADOW_DEFAULT, ...selected.shadow, opacity: v } })}
                />
                <Num
                  label="Blur (px)"
                  value={selected.shadow?.blur ?? 6}
                  onChange={(v) => onPatch(selected.id, { shadow: { ...SHADOW_DEFAULT, ...selected.shadow, blur: v } })}
                />
                <Num
                  label="Offset X (px)"
                  value={selected.shadow?.offsetX ?? 0}
                  onChange={(v) => onPatch(selected.id, { shadow: { ...SHADOW_DEFAULT, ...selected.shadow, offsetX: v } })}
                />
                <Num
                  label="Offset Y (px)"
                  value={selected.shadow?.offsetY ?? 4}
                  onChange={(v) => onPatch(selected.id, { shadow: { ...SHADOW_DEFAULT, ...selected.shadow, offsetY: v } })}
                />
              </div>
            ) : null}
          </div>

          {/* ------ Gradient: this element's own, independent of every other. */}
          <div className="grid gap-2 rounded-lg border border-sr-line p-2.5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-sr-ink">
              <input
                type="checkbox"
                checked={selected.gradient?.enabled ?? false}
                onChange={(e) =>
                  onPatch(selected.id, {
                    gradient: { ...GRADIENT_DEFAULT, ...selected.gradient, enabled: e.target.checked },
                  })
                }
              />
              Gradient {selected.kind === "TEXT" ? "(colours the letters)" : "(washes over the area)"}
            </label>
            {selected.gradient?.enabled ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Colour 1">
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg border border-field bg-field-bg"
                    value={selected.gradient?.color1 ?? "#ff6b2c"}
                    onChange={(e) =>
                      onPatch(selected.id, { gradient: { ...GRADIENT_DEFAULT, ...selected.gradient, color1: e.target.value } })
                    }
                  />
                </Field>
                <Field label="Colour 2">
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg border border-field bg-field-bg"
                    value={selected.gradient?.color2 ?? "#151b39"}
                    onChange={(e) =>
                      onPatch(selected.id, { gradient: { ...GRADIENT_DEFAULT, ...selected.gradient, color2: e.target.value } })
                    }
                  />
                </Field>
                <Num
                  label="Angle °"
                  value={selected.gradient?.angle ?? 135}
                  onChange={(v) => onPatch(selected.id, { gradient: { ...GRADIENT_DEFAULT, ...selected.gradient, angle: v } })}
                />
                {selected.kind !== "TEXT" ? (
                  <Num
                    label="Intensity %"
                    value={selected.gradient?.opacity ?? 60}
                    onChange={(v) => onPatch(selected.id, { gradient: { ...GRADIENT_DEFAULT, ...selected.gradient, opacity: v } })}
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          {selected.kind !== "FRAME" ? (
            <label className="flex items-center gap-2 text-sm text-sr-body">
              <input
                type="checkbox"
                checked={selected.required}
                onChange={(e) => onPatch(selected.id, { required: e.target.checked })}
              />
              The customer must fill this
            </label>
          ) : null}

          <div className="sm:col-span-2">
            <VisibilityRuleEditor
              config={config}
              rule={selected.visibleWhen}
              subject="area"
              onChange={(visibleWhen) => onPatch(selected.id, { visibleWhen })}
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => onRemove(selected.id)}
              className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger"
            >
              Remove this area
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-sr-muted">Pick an area above, or add one.</p>
      )}
    </div>
  );
}

/**
 * Choices that are not content: colour, thickness, size, LED colour.
 *
 * One editor for all of them, because they are one record in the schema.
 * Adding "border colour" later needs no new code here or on the customer side.
 */
function OptionsTab({
  config,
  onChange,
}: {
  config: CustomizerConfig;
  onChange: (next: CustomizerConfig) => void;
}) {
  const patch = (id: string, next: Partial<CustomizerOptionGroup>) =>
    onChange({
      ...config,
      optionGroups: config.optionGroups.map((g) => (g.id === id ? { ...g, ...next } : g)),
    });

  const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-sr-muted">
        Each option can move the price, and an LED group tints the glow layer on any lit view.
      </p>

      {config.optionGroups.map((group) => (
        <div key={group.id} className="rounded-lg border border-sr-line p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Group name">
              <input
                className={input}
                value={group.label}
                onChange={(e) => patch(group.id, { label: e.target.value })}
              />
            </Field>
            <Field label="Shown as">
              <select
                className={input}
                value={group.kind}
                onChange={(e) =>
                  patch(group.id, { kind: e.target.value as CustomizerOptionGroup["kind"] })
                }
              >
                <option value="CHOICE">Labelled buttons</option>
                <option value="SWATCH">Colour swatches</option>
                <option value="LED">LED colour, tints the glow</option>
              </select>
            </Field>
            <Field label="Help text">
              <input
                className={input}
                value={group.helpText}
                onChange={(e) => patch(group.id, { helpText: e.target.value })}
              />
            </Field>
          </div>

          <ul className="mt-3 grid gap-2">
            {group.options.map((option, i) => (
              <li
                key={option.id}
                className="grid gap-2 rounded-lg bg-sr-canvas p-2 sm:grid-cols-[1fr_auto_auto_auto_auto]"
              >
                <input
                  className={input}
                  value={option.label}
                  placeholder="Name"
                  onChange={(e) =>
                    patch(group.id, {
                      options: group.options.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)),
                    })
                  }
                />
                <input
                  type="color"
                  title="Swatch colour"
                  className="h-10 w-12 rounded-lg border border-field bg-field-bg"
                  value={option.hex ?? "#000000"}
                  onChange={(e) =>
                    patch(group.id, {
                      options: group.options.map((o, j) => (j === i ? { ...o, hex: e.target.value } : o)),
                    })
                  }
                />
                <input
                  type="number"
                  title="Price change, in rupees"
                  className={`${input} sm:w-28`}
                  value={option.priceDeltaP / 100}
                  onChange={(e) =>
                    patch(group.id, {
                      options: group.options.map((o, j) =>
                        j === i ? { ...o, priceDeltaP: Math.round(Number(e.target.value) * 100) || 0 } : o,
                      ),
                    })
                  }
                />
                <label className="flex items-center gap-1.5 px-1 text-xs whitespace-nowrap text-sr-body">
                  <input
                    type="checkbox"
                    checked={option.available}
                    onChange={(e) =>
                      patch(group.id, {
                        options: group.options.map((o, j) =>
                          j === i ? { ...o, available: e.target.checked } : o,
                        ),
                      })
                    }
                  />
                  In stock
                </label>
                <button
                  type="button"
                  disabled={group.options.length <= 1}
                  onClick={() => patch(group.id, { options: group.options.filter((_, j) => j !== i) })}
                  className="rounded-lg border border-danger px-2 py-1 text-xs font-semibold text-danger disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3">
            <VisibilityRuleEditor
              config={config}
              rule={group.visibleWhen}
              subject="group"
              excludeGroupId={group.id}
              onChange={(visibleWhen) => patch(group.id, { visibleWhen })}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                patch(group.id, {
                  options: [
                    ...group.options,
                    {
                      id: newId("opt"),
                      label: "New option",
                      hex: "#000000",
                      priceDeltaP: 0,
                      available: true,
                      sku: "",
                    },
                  ],
                })
              }
              className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
            >
              Add option
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...config,
                  optionGroups: config.optionGroups.filter((g) => g.id !== group.id),
                })
              }
              className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger"
            >
              Remove group
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange({
            ...config,
            optionGroups: [
              ...config.optionGroups,
              {
                id: newId("grp"),
                label: "Colour",
                kind: "SWATCH",
                required: true,
                helpText: "",
                visibleWhen: null,
                options: [
                  {
                    id: newId("opt"),
                    label: "Black",
                    hex: "#0f121f",
                    priceDeltaP: 0,
                    available: true,
                    sku: "",
                  },
                ],
              },
            ],
          })
        }
        className="justify-self-start rounded-lg border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body"
      >
        Add a group
      </button>
    </div>
  );
}

/**
 * "Show this only when…" — a conditional-visibility rule.
 *
 * Lets the admin reveal a zone or an option group only for certain choices in
 * another group, e.g. a photo area that appears only when "With photo" is
 * picked. The server enforces the same rule when it prices and validates, so
 * this is a real behaviour, not a preview trick (§18).
 */
function VisibilityRuleEditor({
  config,
  rule,
  subject,
  excludeGroupId,
  onChange,
}: {
  config: CustomizerConfig;
  rule: VisibilityRule;
  subject: "area" | "group";
  /** A group cannot depend on itself. */
  excludeGroupId?: string;
  onChange: (rule: VisibilityRule) => void;
}) {
  const groups = config.optionGroups.filter((g) => g.id !== excludeGroupId);
  const dep = rule ? groups.find((g) => g.id === rule.groupId) ?? null : null;

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-sr-line px-3 py-2 text-[11px] text-sr-muted">
        Add an option group under “Colours &amp; sizes” to show this {subject} only for certain
        choices.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-sr-line bg-sr-canvas p-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-sr-muted uppercase">
        When to show this {subject}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <select
          className={`${input} max-w-[220px]`}
          value={rule?.groupId ?? ""}
          onChange={(e) => {
            const groupId = e.target.value;
            if (!groupId) return onChange(null);
            const first = groups.find((g) => g.id === groupId)?.options[0]?.id;
            onChange({ groupId, optionIds: first ? [first] : [] });
          }}
        >
          <option value="">Always show it</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              Only for a choice in “{g.label}”
            </option>
          ))}
        </select>
      </div>

      {dep ? (
        <div className="mt-2">
          <p className="text-[11px] text-sr-muted">Shown when any of these is chosen:</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {dep.options.map((option) => {
              const on = rule?.optionIds.includes(option.id) ?? false;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (!rule) return;
                    const next = on
                      ? rule.optionIds.filter((id) => id !== option.id)
                      : [...rule.optionIds, option.id];
                    // Never leave a rule matching nothing; that would hide the
                    // subject forever. Fall back to "always" instead.
                    onChange(next.length > 0 ? { ...rule, optionIds: next } : null);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    on ? "border-sr-600 bg-sr-50 text-sr-700" : "border-sr-line-strong text-sr-body"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Starting templates: named sets of colours and wording a customer can begin
 * from. A template never carries a photo — it is a head start, not a saved
 * design.
 */
function TemplatesTab({
  config,
  onChange,
}: {
  config: CustomizerConfig;
  onChange: (next: CustomizerConfig) => void;
}) {
  const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
  const textZones = config.zones.filter((z) => z.kind === "TEXT");

  const patch = (id: string, next: Partial<CustomizerTemplate>) =>
    onChange({
      ...config,
      templates: config.templates.map((t) => (t.id === id ? { ...t, ...next } : t)),
    });

  return (
    <div className="grid gap-4">
      <p className="text-sm text-sr-muted">
        A template pre-fills the colours, sizes and wording so the customer starts part-way there.
        Their photo is never touched. Leave this empty and customers simply start from scratch.
      </p>

      {config.templates.map((template) => (
        <div key={template.id} className="rounded-lg border border-sr-line p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Template name">
              <input
                className={input}
                value={template.label}
                onChange={(e) => patch(template.id, { label: e.target.value })}
              />
            </Field>
            <Field label="Description" hint="A short line shown under the name.">
              <input
                className={input}
                value={template.description}
                onChange={(e) => patch(template.id, { description: e.target.value })}
              />
            </Field>
            <Field label="Opens on view">
              <select
                className={input}
                value={template.viewId}
                onChange={(e) => patch(template.id, { viewId: e.target.value })}
              >
                <option value="">Leave the view as-is</option>
                {config.views.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {config.optionGroups.length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold tracking-wide text-sr-muted uppercase">
                Preset choices
              </p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {config.optionGroups.map((group) => (
                  <Field key={group.id} label={group.label}>
                    <select
                      className={input}
                      value={template.options[group.id] ?? ""}
                      onChange={(e) => {
                        const options = { ...template.options };
                        if (e.target.value) options[group.id] = e.target.value;
                        else delete options[group.id];
                        patch(template.id, { options });
                      }}
                    >
                      <option value="">No preset</option>
                      {group.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </div>
          ) : null}

          {textZones.length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold tracking-wide text-sr-muted uppercase">
                Preset wording
              </p>
              <div className="mt-1.5 grid gap-2">
                {textZones.map((zone) => (
                  <Field key={zone.id} label={zone.label}>
                    <input
                      className={input}
                      maxLength={zone.maxChars ?? 120}
                      value={template.text[zone.id] ?? ""}
                      onChange={(e) => {
                        const text = { ...template.text };
                        if (e.target.value) text[zone.id] = e.target.value;
                        else delete text[zone.id];
                        patch(template.id, { text });
                      }}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...config,
                  templates: config.templates.filter((t) => t.id !== template.id),
                })
              }
              className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger"
            >
              Remove template
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange({
            ...config,
            templates: [
              ...config.templates,
              { id: newId("tpl"), label: "New template", description: "", viewId: "", options: {}, text: {} },
            ],
          })
        }
        className="justify-self-start rounded-lg border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body"
      >
        Add template
      </button>
    </div>
  );
}

/**
 * A named, allow-listed set of colours the customer may choose from.
 * The customer never gets a free colour picker — only these.
 */
function AllowedColorsEditor({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: { enabled: boolean; colors: string[]; default: string | null };
  onChange: (next: { enabled: boolean; colors: string[]; default: string | null }) => void;
}) {
  const [pending, setPending] = useState("#ff6b2c");

  return (
    <div className="rounded-lg border border-sr-line p-3">
      <label className="flex items-center gap-2 text-sm font-semibold text-sr-ink">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        {label} (allowed)
      </label>
      <p className="mt-0.5 text-[11px] text-sr-muted">{hint}</p>

      {value.enabled ? (
        <div className="mt-2 grid gap-2">
          {value.colors.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {value.colors.map((c) => (
                <span
                  key={c}
                  className={`inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-1.5 text-xs ${
                    value.default === c ? "border-sr-600" : "border-sr-line-strong"
                  }`}
                >
                  <span className="h-4 w-4 rounded-full border border-sr-line" style={{ background: c }} />
                  {c}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...value,
                        colors: value.colors.filter((x) => x !== c),
                        default: value.default === c ? null : value.default,
                      })
                    }
                    className="rounded px-1 text-sr-muted hover:text-danger"
                    aria-label={`Remove ${c}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-sr-muted">No colours yet — add at least one.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={pending}
              onChange={(e) => setPending(e.target.value)}
              className="h-9 w-12 rounded-lg border border-field bg-field-bg"
            />
            <input
              value={pending}
              onChange={(e) => setPending(e.target.value)}
              className={`${input} max-w-[120px]`}
              placeholder="#ff6b2c"
            />
            <button
              type="button"
              onClick={() => {
                const hex = pending.trim().toLowerCase();
                if (!/^#[0-9a-f]{6}$/.test(hex) || value.colors.includes(hex)) return;
                onChange({
                  ...value,
                  colors: [...value.colors, hex],
                  default: value.default ?? hex,
                });
              }}
              className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
            >
              Add
            </button>
          </div>

          {value.colors.length > 0 ? (
            <label className="flex items-center gap-2 text-xs text-sr-body">
              Default
              <select
                className={`${input} max-w-[140px]`}
                value={value.default ?? ""}
                onChange={(e) => onChange({ ...value, default: e.target.value || null })}
              >
                {value.colors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Everything the customer is allowed to restyle (§ Frame Designer, "Customer
 * Options"). Layout stays locked; each control here is off until the admin
 * turns it on, and the customer only ever sees what is turned on.
 */
function CustomerOptionsTab({
  config,
  onChange,
}: {
  config: CustomizerConfig;
  onChange: (next: CustomizerConfig) => void;
}) {
  const co = config.customerOptions;
  const setCO = (next: Partial<typeof co>) =>
    onChange({ ...config, customerOptions: { ...co, ...next } });

  const [newGoogle, setNewGoogle] = useState("");
  const [uploadingFont, setUploadingFont] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);
  const [sizeLabel, setSizeLabel] = useState("");
  const [sizePx, setSizePx] = useState("");
  const fontFileRef = useRef<HTMLInputElement>(null);

  async function uploadFonts(files: FileList) {
    setUploadingFont(true);
    setFontError(null);
    try {
      const added: typeof co.font.families = [];
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/admin/customizer/fonts", { method: "POST", body });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setFontError(json?.error?.message ?? "That font could not be uploaded.");
          continue;
        }
        added.push({
          name: json.data.name as string,
          source: "upload",
          url: json.data.url as string,
          format: json.data.format as typeof co.font.families[number]["format"],
        });
      }
      if (added.length > 0) {
        const merged = [...co.font.families];
        for (const f of added) if (!merged.some((m) => m.name === f.name)) merged.push(f);
        setCO({ font: { ...co.font, families: merged, default: co.font.default || added[0].name } });
      }
    } finally {
      setUploadingFont(false);
      if (fontFileRef.current) fontFileRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-sr-muted">
        The customer can change only what you turn on here — the layout stays locked. Everything is
        off by default.
      </p>

      <AllowedColorsEditor
        label="Frame colour"
        hint="Tints any frame set to follow the frame colour."
        value={co.frameColor}
        onChange={(v) => setCO({ frameColor: v })}
      />
      <AllowedColorsEditor
        label="Text colour"
        hint="Applied to every text box."
        value={co.textColor}
        onChange={(v) => setCO({ textColor: v })}
      />

      {/* -------------------------------------------------------- fonts */}
      <div className="rounded-lg border border-sr-line p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-sr-ink">
          <input
            type="checkbox"
            checked={co.font.enabled}
            onChange={(e) => setCO({ font: { ...co.font, enabled: e.target.checked } })}
          />
          Font style — let customers pick the font
        </label>
        <p className="mt-0.5 text-[11px] text-sr-muted">
          Add or remove fonts below (Google Fonts by name, or your own font files). Tick the box to
          offer the font picker to customers.
        </p>

        {
          <div className="mt-2 grid gap-2">
            {co.font.families.length > 0 ? (
              <ul className="grid gap-1">
                {co.font.families.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center gap-2 rounded-md bg-sr-canvas px-2 py-1 text-xs"
                  >
                    <span className="flex-1 truncate font-medium text-sr-body" style={{ fontFamily: `"${f.name}"` }}>
                      {f.name}
                    </span>
                    <span className="rounded bg-sr-surface px-1.5 py-0.5 text-[10px] text-sr-muted">
                      {f.source}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCO({
                          font: {
                            ...co.font,
                            families: co.font.families.filter((x) => x.name !== f.name),
                            default: co.font.default === f.name ? "" : co.font.default,
                          },
                        })
                      }
                      className="rounded px-1 text-sr-muted hover:text-danger"
                      aria-label={`Remove ${f.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-sr-muted">No fonts yet.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newGoogle}
                onChange={(e) => setNewGoogle(e.target.value)}
                placeholder="Google font name (e.g. Lobster)"
                className={`${input} max-w-[220px]`}
              />
              <button
                type="button"
                onClick={() => {
                  const name = newGoogle.trim();
                  if (!name || co.font.families.some((f) => f.name === name)) return;
                  setCO({
                    font: {
                      ...co.font,
                      families: [...co.font.families, { name, source: "google", url: "", format: "" }],
                      default: co.font.default || name,
                    },
                  });
                  setNewGoogle("");
                }}
                className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
              >
                + Add Google font
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fontFileRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) void uploadFonts(e.target.files);
                }}
              />
              <button
                type="button"
                disabled={uploadingFont}
                onClick={() => fontFileRef.current?.click()}
                className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body disabled:opacity-60"
              >
                {uploadingFont ? "Uploading…" : "Upload font file (.ttf / .otf / .woff)"}
              </button>
            </div>
            {fontError ? <p className="text-[11px] text-danger">{fontError}</p> : null}

            {co.font.families.length > 0 ? (
              <label className="flex items-center gap-2 text-xs text-sr-body">
                Default
                <select
                  className={`${input} max-w-[180px]`}
                  value={co.font.default}
                  onChange={(e) => setCO({ font: { ...co.font, default: e.target.value } })}
                >
                  {co.font.families.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        }
      </div>

      {/* ---------------------------------------------------- text size */}
      <div className="rounded-lg border border-sr-line p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-sr-ink">
          <input
            type="checkbox"
            checked={co.textSize.enabled}
            onChange={(e) => setCO({ textSize: { ...co.textSize, enabled: e.target.checked } })}
          />
          Text size (fixed choices)
        </label>
        <p className="mt-0.5 text-[11px] text-sr-muted">
          The customer picks from these sizes; they scale the text proportionally.
        </p>

        {co.textSize.enabled ? (
          <div className="mt-2 grid gap-2">
            {co.textSize.choices.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {co.textSize.choices.map((c) => (
                  <span
                    key={`${c.label}-${c.px}`}
                    className={`inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs ${
                      co.textSize.default === c.px ? "border-sr-600" : "border-sr-line-strong"
                    }`}
                  >
                    {c.label} — {c.px}px
                    <button
                      type="button"
                      onClick={() =>
                        setCO({
                          textSize: {
                            ...co.textSize,
                            choices: co.textSize.choices.filter((x) => !(x.label === c.label && x.px === c.px)),
                            default: co.textSize.default === c.px ? null : co.textSize.default,
                          },
                        })
                      }
                      className="rounded px-1 text-sr-muted hover:text-danger"
                      aria-label={`Remove ${c.label}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-sr-muted">No sizes yet.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={sizeLabel}
                onChange={(e) => setSizeLabel(e.target.value)}
                placeholder="Label (e.g. Medium)"
                className={`${input} max-w-[150px]`}
              />
              <input
                value={sizePx}
                onChange={(e) => setSizePx(e.target.value)}
                placeholder="px"
                inputMode="numeric"
                className={`${input} max-w-[80px]`}
              />
              <button
                type="button"
                onClick={() => {
                  const px = Math.round(Number(sizePx));
                  const label = sizeLabel.trim();
                  if (!label || !Number.isFinite(px) || px < 6 || px > 200) return;
                  if (co.textSize.choices.some((c) => c.px === px)) return;
                  setCO({
                    textSize: {
                      ...co.textSize,
                      choices: [...co.textSize.choices, { label, px }].sort((a, b) => a.px - b.px),
                      default: co.textSize.default ?? px,
                    },
                  });
                  setSizeLabel("");
                  setSizePx("");
                }}
                className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
              >
                Add
              </button>
            </div>

            {co.textSize.choices.length > 0 ? (
              <label className="flex items-center gap-2 text-xs text-sr-body">
                Default
                <select
                  className={`${input} max-w-[160px]`}
                  value={co.textSize.default ?? ""}
                  onChange={(e) =>
                    setCO({ textSize: { ...co.textSize, default: Number(e.target.value) || null } })
                  }
                >
                  {co.textSize.choices.map((c) => (
                    <option key={c.px} value={c.px}>
                      {c.label} ({c.px}px)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------ acrylic mirror */}
      <div className="rounded-lg border border-sr-line p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-sr-ink">
          <input
            type="checkbox"
            checked={co.acrylicMirror.enabled}
            onChange={(e) => setCO({ acrylicMirror: { enabled: e.target.checked } })}
          />
          Acrylic mirror text
        </label>
        <p className="mt-0.5 text-[11px] text-sr-muted">
          4mm mirror finish, 3D raised text — normal colours still apply.
        </p>
      </div>

      {/* ------------------------------------------------------ gradient */}
      <div className="rounded-lg border border-sr-line p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-sr-ink">
          <input
            type="checkbox"
            checked={co.gradient.enabled}
            onChange={(e) => setCO({ gradient: { ...co.gradient, enabled: e.target.checked } })}
          />
          Gradient
        </label>
        <p className="mt-0.5 text-[11px] text-sr-muted">
          Shows the customer an on/off switch; off by default.
        </p>

        {co.gradient.enabled ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Field label="Colour 1">
              <input
                type="color"
                className="h-10 w-full rounded-lg border border-field bg-field-bg"
                value={co.gradient.color1}
                onChange={(e) => setCO({ gradient: { ...co.gradient, color1: e.target.value } })}
              />
            </Field>
            <Field label="Colour 2">
              <input
                type="color"
                className="h-10 w-full rounded-lg border border-field bg-field-bg"
                value={co.gradient.color2}
                onChange={(e) => setCO({ gradient: { ...co.gradient, color2: e.target.value } })}
              />
            </Field>
            <Field label={`Direction: ${co.gradient.direction}°`}>
              <input
                type="range"
                min={0}
                max={360}
                value={co.gradient.direction}
                onChange={(e) => setCO({ gradient: { ...co.gradient, direction: Number(e.target.value) } })}
                className="w-full accent-sr-600"
              />
            </Field>
            <label className="flex items-center gap-2 self-end text-sm text-sr-body">
              <input
                type="checkbox"
                checked={co.gradient.applyToPhotos}
                onChange={(e) => setCO({ gradient: { ...co.gradient, applyToPhotos: e.target.checked } })}
              />
              Also apply to photos
            </label>
          </div>
        ) : null}
      </div>

      {/* --------------------------------------------------------- LED */}
      <div className="rounded-lg border border-sr-line p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-sr-ink">
          <input
            type="checkbox"
            checked={co.ledGlow.enabled}
            onChange={(e) => setCO({ ledGlow: { enabled: e.target.checked } })}
          />
          Light / LED glow
        </label>
        <p className="mt-0.5 text-[11px] text-sr-muted">
          Gives the customer an LED glow on/off toggle on lit views.
        </p>
      </div>
    </div>
  );
}

function ToolsTab({
  config,
  onChange,
}: {
  config: CustomizerConfig;
  onChange: (next: CustomizerConfig) => void;
}) {
  const tools = config.tools;
  const set = (key: keyof typeof tools, value: boolean) =>
    onChange({ ...config, tools: { ...tools, [key]: value } });

  return (
    <div className="grid gap-4">
      <p className="text-sm text-sr-muted">
        A simple product should not show controls it has no use for.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["photoUpload", "Photo upload"],
            ["zoom", "Zoom"],
            ["rotate", "Rotate"],
            ["flip", "Flip"],
            ["text", "Text"],
            ["undoRedo", "Undo and redo"],
            ["fullscreenPreview", "Fullscreen preview"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-sr-body">
            <input type="checkbox" checked={tools[key]} onChange={(e) => set(key, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div className="grid gap-3 border-t border-sr-line pt-3 sm:grid-cols-2">
        <Field label="Personalisation fee (₹)" hint="Added once when the customer personalises.">
          <input
            type="number"
            min="0"
            className={input}
            value={config.customizationFeeP / 100}
            onChange={(e) =>
              onChange({ ...config, customizationFeeP: Math.round(Number(e.target.value) * 100) || 0 })
            }
          />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-sm text-sr-body">
        <input
          type="checkbox"
          className="mt-1"
          checked={config.strictQuality}
          onChange={(e) => onChange({ ...config, strictQuality: e.target.checked })}
        />
        <span>
          Block add-to-cart on a low-resolution photo
          <span className="mt-0.5 block text-xs text-sr-muted">
            Off by default: the customer is warned but not stopped.
          </span>
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm text-sr-body">
        <input
          type="checkbox"
          checked={config.colorNotice}
          onChange={(e) => onChange({ ...config, colorNotice: e.target.checked })}
        />
        Show the screen-colour notice under the preview
      </label>
    </div>
  );
}

/* --------------------------------------------------------------- helpers */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-sr-ink">{label}</span>
      {children}
      {hint ? <span className="text-xs text-sr-muted">{hint}</span> : null}
    </label>
  );
}

/** Admin-only image upload (JPG/PNG) with a preview and replace/remove, used for
 *  frame images and clipping masks. Posts to the shared /api/admin/media route. */
function MediaUploadField({
  label,
  hint,
  value,
  onChange,
  accept = "image/jpeg,image/png,image/webp",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  accept?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data?.url) onChange(json.data.url);
      else setError(json?.error?.message ?? "That file could not be uploaded.");
    } catch {
      setError("Network problem — try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold text-sr-ink">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded border border-sr-line-strong bg-sr-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-full w-full object-contain" />
          </span>
        ) : null}
        <button
          type="button"
          disabled={uploading}
          onClick={() => ref.current?.click()}
          className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400 disabled:opacity-60"
        >
          {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs font-semibold text-danger hover:underline"
          >
            Remove
          </button>
        ) : null}
        <input
          ref={ref}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </div>
      {hint ? <span className="text-xs text-sr-muted">{hint}</span> : null}
      {error ? <span className="text-xs font-medium text-danger">{error}</span> : null}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step="0.5"
        className={input}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}

function withStarterView(config: CustomizerConfig, image: string): CustomizerConfig {
  return {
    ...config,
    views: [
      {
        id: "front",
        label: "Front",
        base: image,
        overlay: "",
        glow: "",
        zoneIds: [],
        isLit: false,
      },
    ],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
