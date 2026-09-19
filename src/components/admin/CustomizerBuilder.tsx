"use client";

import { useCallback, useRef, useState } from "react";

import { emptyDesign, type CustomerDesign } from "@/lib/customizer/design";
import {
  EMPTY_CONFIG,
  type CustomizerConfig,
  type CustomizerOptionGroup,
  type CustomizerView,
  type CustomizerZone,
} from "@/lib/customizer/schema";
import { CustomizerCanvas } from "@/components/shop/customizer/CustomizerCanvas";

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

type Tab = "views" | "zones" | "options" | "tools";

export function CustomizerBuilder({
  productId,
  productName,
  initial,
  productImages,
}: {
  productId: string;
  productName: string;
  initial: CustomizerConfig;
  productImages: string[];
}) {
  const [config, setConfig] = useState<CustomizerConfig>(
    initial.views.length > 0 ? initial : withStarterView(initial, productImages[0] ?? ""),
  );
  const [tab, setTab] = useState<Tab>("views");
  const [viewId, setViewId] = useState(() => initial.views[0]?.id ?? "front");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ zoneId: string; startX: number; startY: number; zx: number; zy: number } | null>(
    null,
  );

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

  const patchZone = useCallback((zoneId: string, patch: Partial<CustomizerZone>) => {
    setConfig((prev) => ({
      ...prev,
      zones: prev.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)),
    }));
  }, []);

  const patchView = useCallback((id: string, patch: Partial<CustomizerView>) => {
    setConfig((prev) => ({
      ...prev,
      views: prev.views.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  }, []);

  /* ------------------------------------------------------------- dragging */

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>, z: CustomizerZone) {
    event.preventDefault();
    setSelectedZone(z.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { zoneId: z.id, startX: event.clientX, startY: event.clientY, zx: z.x, zy: z.y };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const box = surface.current?.getBoundingClientRect();
    if (!state || !box) return;

    const dx = ((event.clientX - state.startX) / box.width) * 100;
    const dy = ((event.clientY - state.startY) / box.height) * 100;
    const target = config.zones.find((z) => z.id === state.zoneId);
    if (!target) return;

    patchZone(state.zoneId, {
      x: round(clamp(state.zx + dx, 0, 100 - target.width)),
      y: round(clamp(state.zy + dy, 0, 100 - target.height)),
    });
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
      setConfig(json.data.config);
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

          {/* Drag handles sit over the canvas so the admin moves the real zone
              rather than a separate drawing that could disagree with it. */}
          {view
            ? config.zones
                .filter((z) => view.zoneIds.includes(z.id))
                .map((z) => (
                  <div
                    key={z.id}
                    onPointerDown={(e) => onPointerDown(e, z)}
                    style={{
                      left: `calc(${z.x}% + 0.5rem)`,
                      top: `calc(${z.y}% + 0.5rem)`,
                      width: `${z.width}%`,
                      height: `${z.height}%`,
                    }}
                    className={`absolute cursor-move rounded ${
                      selectedZone === z.id ? "ring-2 ring-sr-600" : "ring-1 ring-sr-400/60"
                    }`}
                    title={`Drag ${z.label}`}
                  />
                ))
            : null}
        </div>

        <p className="mt-2 text-xs text-sr-muted">
          Drag a zone to move it. Use the numbers on the right for exact placement.
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
          {(["views", "zones", "options", "tools"] as Tab[]).map((t) => (
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
                    ? "Colours & sizes"
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
                  label: kind === "PHOTO" ? "Photo" : "Text",
                  shape: "RECT",
                  x: 25,
                  y: 25,
                  width: 50,
                  height: kind === "PHOTO" ? 40 : 10,
                  rotation: 0,
                  cornerRadius: 0,
                  safeInset: kind === "PHOTO" ? 4 : 0,
                  required: true,
                  printWidthMm: kind === "PHOTO" ? 150 : null,
                  printHeightMm: kind === "PHOTO" ? 100 : null,
                  minDpi: 150,
                  maxChars: kind === "TEXT" ? 30 : null,
                  defaultText: "",
                  fontFamily: "Inter",
                  fontSizePct: 55,
                  color: "#0f121f",
                  align: "center",
                };
                setConfig((prev) => ({
                  ...prev,
                  zones: [...prev.zones, created],
                  views: prev.views.map((v) =>
                    v.id === (view?.id ?? "") ? { ...v, zoneIds: [...v.zoneIds, id] } : v,
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
            />
          ) : null}

          {tab === "options" ? <OptionsTab config={config} onChange={setConfig} /> : null}

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
  );
}

/* ------------------------------------------------------------------ tabs */

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
            <Field label="Base image" hint="What the customer's content sits on.">
              <select
                className={input}
                value={view.base}
                onChange={(e) => onPatch(view.id, { base: e.target.value })}
              >
                <option value="">Choose an image</option>
                {productImages.map((url, i) => (
                  <option key={`${url}-${i}`} value={url}>
                    {url.split("/").pop()}
                  </option>
                ))}
              </select>
            </Field>
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
}: {
  config: CustomizerConfig;
  view: CustomizerView | null;
  selected: CustomizerZone | null;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<CustomizerZone>) => void;
  onAdd: (kind: "PHOTO" | "TEXT") => void;
  onRemove: (id: string) => void;
}) {
  const inView = view ? config.zones.filter((z) => view.zoneIds.includes(z.id)) : [];

  return (
    <div className="grid gap-4">
      <p className="text-sm text-sr-muted">
        An editable area on {view?.label ?? "this view"}. Drag it on the preview, then fine-tune the
        numbers here.
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
          + Photo area
        </button>
        <button
          type="button"
          onClick={() => onAdd("TEXT")}
          className="rounded-full border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
        >
          + Text area
        </button>
      </div>

      {selected ? (
        <div className="grid gap-3 rounded-lg border border-sr-line p-3 sm:grid-cols-2">
          <Field label="Label" hint="What the customer is asked for.">
            <input
              className={input}
              value={selected.label}
              onChange={(e) => onPatch(selected.id, { label: e.target.value })}
            />
          </Field>
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
            </>
          ) : (
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
              <Field label="Text colour">
                <input
                  type="color"
                  className="h-10 w-full rounded-lg border border-field bg-field-bg"
                  value={selected.color}
                  onChange={(e) => onPatch(selected.id, { color: e.target.value })}
                />
              </Field>
            </>
          )}

          <label className="flex items-center gap-2 text-sm text-sr-body">
            <input
              type="checkbox"
              checked={selected.required}
              onChange={(e) => onPatch(selected.id, { required: e.target.checked })}
            />
            The customer must fill this
          </label>

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
