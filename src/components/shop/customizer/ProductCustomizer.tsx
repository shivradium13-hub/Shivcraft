"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatPaise } from "@/lib/money";
import { dominantGradient } from "@/lib/customizer/colours";
import {
  emptyDesign,
  type CustomerDesign,
  type DesignStyle,
  type PhotoPlacement,
  type TextPlacement,
} from "@/lib/customizer/design";
import {
  fontStack,
  isGroupVisible,
  isZoneVisible,
  resolveOption,
  resolveTextStyle,
  zonesForView,
  type CustomizerConfig,
  type CustomizerTemplate,
  type CustomizerZone,
} from "@/lib/customizer/schema";

import { CustomizerCanvas } from "./CustomizerCanvas";
import { publishCustomizer } from "./customizerBridge";
import { RepositionBox } from "./RepositionBox";
import { usePhotoGestures } from "./usePhotoGestures";
import { PhotoCropModal } from "./PhotoCropModal";

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
  /** Whether the visitor is signed in, so the save action can be offered
   *  honestly rather than shown to someone the API would refuse. */
  signedIn?: boolean;
  /** A saved design being opened from the account, used as the starting point
   *  in place of any local draft. */
  initialDesign?: CustomerDesign | null;
  initialDesignName?: string | null;
  /** When true, the live preview is rendered elsewhere (the product image, via
   *  the bridge) rather than inside this panel, so this panel shows only the
   *  controls and publishes its state under `bridgeId`. */
  integrated?: boolean;
  bridgeId?: string;
};

const MAX_HISTORY = 40;

export function ProductCustomizer({
  productId,
  productName,
  config,
  basePriceP,
  onDesignChange,
  signedIn = false,
  initialDesign = null,
  initialDesignName = null,
  integrated = false,
  bridgeId,
}: Props) {
  const storageKey = `sr:design:${productId}:v${config.version}`;
  const firstView = config.views[0]?.id ?? "";

  const [design, setDesign] = useState<CustomerDesign>(() =>
    withDefaultStyle(
      withDefaultOptions(
        // A design opened from the account wins over a local draft; otherwise the
        // draft from last visit; otherwise the product as the admin designed it —
        // its default wording already in place, ready for the customer to edit.
        normaliseLoaded(initialDesign, config, firstView) ??
          restore(storageKey, config.version) ??
          withStarterText(emptyDesign(config.version, firstView), config),
        config,
      ),
      config,
    ),
  );
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The "we kept your earlier design" banner only makes sense for a local
  // draft — not when we deliberately opened a saved one.
  const [restored, setRestored] = useState(
    () => !initialDesign && restore(storageKey, config.version) !== null,
  );
  const [fullscreen, setFullscreen] = useState(false);

  /* Reposition mode: the id of the text area the customer is dragging into
     place, or null. The area shows a handle box only while this is set, so the
     preview stays clean the rest of the time. */
  const [reposition, setReposition] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  /* Optional areas the customer has switched off, and the wording they had in
     them — kept so turning an area back on restores exactly what they wrote. */
  const [hiddenZones, setHiddenZones] = useState<Set<string>>(new Set());
  const hiddenTextRef = useRef<Record<string, string>>({});

  /* Saving the current design to the account. `null` name means the input is
     closed; the flow is: open → type a name → save → confirmation. */
  const [saveName, setSaveName] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "done">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);


  /* State, not refs: the Undo and Redo buttons read these to decide whether
     they are available, and a ref would leave them frozen at their first
     value because changing one does not re-render. */
  const [history, setHistory] = useState<CustomerDesign[]>([]);
  const [future, setFuture] = useState<CustomerDesign[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  /* The zone whose photo is open in the crop / adjust editor. `isNew` means a
   *  fresh upload, so cancelling discards it. */
  const [cropCtx, setCropCtx] = useState<{ zoneId: string; isNew: boolean } | null>(null);

  /* Zones on the current view that the customer's option choices reveal. A
     zone hidden by a conditional rule is not shown as a tab, a step or a
     target — it is not part of this design right now (§18). */
  const zones = useMemo(
    () =>
      zonesForView(config, design.viewId).filter(
        // Frames are the admin's decoration, not something the customer edits.
        (z) => z.kind !== "FRAME" && isZoneVisible(config, z, design.options),
      ),
    [config, design.viewId, design.options],
  );
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
      setDesign((prev) => {
        const current = prev.zones[zoneId];
        const text = current?.kind === "TEXT" ? current.text : {};
        return {
          ...prev,
          zones: { ...prev.zones, [zoneId]: { kind: "TEXT", text: { ...text, value } } },
        };
      });
    },
    [],
  );

  /** Sets styling/placement on a text area, keeping its wording. `live` is a
   *  drag in progress: it updates the design without adding a history step, so
   *  one undo steps back the whole gesture rather than one frame. */
  const setTextProps = useCallback(
    (zoneId: string, patch: Partial<TextPlacement>, live = false) => {
      setDesign((prev) => {
        const current = prev.zones[zoneId];
        if (current?.kind !== "TEXT") return prev;
        if (!live) {
          setHistory((h) => [...h, prev].slice(-MAX_HISTORY));
          setFuture([]);
        }
        return {
          ...prev,
          zones: { ...prev.zones, [zoneId]: { kind: "TEXT", text: { ...current.text, ...patch } } },
        };
      });
    },
    [],
  );

  /** Turns an optional text area off (removed from the preview, its wording
   *  stashed) or back on (wording restored). */
  const setZoneHidden = useCallback((zoneId: string, hidden: boolean) => {
    setHiddenZones((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(zoneId);
      else next.delete(zoneId);
      return next;
    });
    setDesign((prev) => {
      setHistory((h) => [...h, prev].slice(-MAX_HISTORY));
      setFuture([]);
      const zones = { ...prev.zones };
      if (hidden) {
        const cur = zones[zoneId];
        if (cur?.kind === "TEXT") hiddenTextRef.current[zoneId] = cur.text.value;
        delete zones[zoneId];
      } else {
        zones[zoneId] = { kind: "TEXT", text: { value: hiddenTextRef.current[zoneId] ?? "" } };
      }
      return { ...prev, zones };
    });
  }, []);

  /** Switches the visible product view (front/back/…). A stable callback so the
   *  view tabs work whether they are rendered here or on the product image. */
  const setViewId = useCallback((viewId: string) => {
    setDesign((prev) => ({ ...prev, viewId }));
  }, []);

  /**
   * Applies a starting template: its option choices, its wording and the view
   * it opens on. Photos are deliberately preserved — a template carries none,
   * and wiping a picture the customer already placed would be a nasty surprise.
   * Recorded as one history step, so a single undo takes it all back.
   */
  const applyTemplate = useCallback(
    (template: CustomizerTemplate) => {
      commit({
        ...design,
        viewId:
          template.viewId && config.views.some((v) => v.id === template.viewId)
            ? template.viewId
            : design.viewId,
        options: { ...design.options, ...template.options },
        zones: {
          ...design.zones,
          ...Object.fromEntries(
            Object.entries(template.text)
              // Only fill text zones the product still has, so a stale template
              // cannot inject content for a zone that was removed.
              .filter(([zoneId]) => config.zones.some((z) => z.id === zoneId && z.kind === "TEXT"))
              .map(([zoneId, value]) => [zoneId, { kind: "TEXT" as const, text: { value } }]),
          ),
        },
      });
    },
    [commit, design, config.views, config.zones],
  );

  const gestures = usePhotoGestures({
    placement: activePhoto,
    enabled: Boolean(activeZone && activePhoto),
    onChange: (patch) => {
      if (activeZone) setPhoto(activeZone.id, patch, true);
    },
  });

  /** A global style choice (colour, font, size, gradient/LED switch). One
   *  history step per choice, so undo steps back one decision. */
  const setStyle = useCallback(
    (patch: Partial<DesignStyle>) => {
      commit({ ...design, style: { ...design.style, ...patch } });
    },
    [commit, design],
  );

  /* ----------------------------------------------------------- save */

  async function saveDesign(name: string) {
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, name, design }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json?.error?.message ?? "That design could not be saved.");
        setSaveState("idle");
        return;
      }
      setSaveState("done");
      setSaveName(null);
    } catch {
      setSaveError("Network problem — check your connection and try again.");
      setSaveState("idle");
    }
  }

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
              scale: startingScale(),
              rotation: 0,
              flipH: false,
              flipV: false,
              naturalWidth: size?.width ?? null,
              naturalHeight: size?.height ?? null,
              brightness: 100,
              contrast: 100,
              saturation: 100,
              fit: "cover",
            },
          },
        },
      });
      // Open the crop / adjust editor over the freshly uploaded photo.
      setCropCtx({ zoneId: zone.id, isNew: true });
    } catch {
      setNotice("The upload did not finish — check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* ---------------------------------------------------------------- price */

  const personalised = Object.keys(design.zones).length > 0;

  /* Mirrors the server arithmetic so the customer sees the same number before
     committing. The server result is still what gets charged. */
  const optionsDeltaP = config.optionGroups.reduce((sum, group) => {
    if (!isGroupVisible(config, group, design.options)) return sum;
    const option = resolveOption(group, design.options[group.id]);
    return sum + (option?.priceDeltaP ?? 0);
  }, 0);
  const totalP = basePriceP + (personalised ? config.customizationFeeP : 0) + optionsDeltaP;

  const quality = activeZone && activePhoto ? localQuality(activeZone, activePhoto) : null;

  /* Progress over the zones this product actually requires, so a text-only
     product does not show a photo step it has no use for (§22). */
  const steps = config.zones
    .filter(
      (z) =>
        z.required &&
        config.views.some((v) => v.zoneIds.includes(z.id)) &&
        isZoneVisible(config, z, design.options),
    )
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

  /* The area currently being dragged into place, resolved to its configuration
     so the handle box can be drawn exactly over it. */
  const repositionZone = reposition ? config.zones.find((z) => z.id === reposition) ?? null : null;

  /* An honest four-step indicator: the product is chosen, personalisation is
     done once nothing is left, and the last two are what remains. */
  const stepIndex = remaining > 0 ? 1 : 2;

  /* When the preview lives on the product image (integrated), publish the live
     state so that preview can render it. A separate unmount-only effect clears
     it, so an ordinary update never blanks the preview between publishes. */
  useEffect(() => {
    if (!integrated || !bridgeId) return;
    publishCustomizer(bridgeId, {
      config,
      design,
      activeZoneId: activeZone?.id ?? null,
      reposition,
      repositionZone,
      onZoneSelect: setActiveZoneId,
      setViewId,
      setTextProps,
      gestureHandlers: gestures.handlers,
    });
  }, [
    integrated,
    bridgeId,
    config,
    design,
    activeZone,
    reposition,
    repositionZone,
    setViewId,
    setTextProps,
    gestures.handlers,
  ]);

  useEffect(() => {
    if (!integrated || !bridgeId) return;
    return () => publishCustomizer(bridgeId, null);
  }, [integrated, bridgeId]);

  /* ----------------------------------------------------------------- view */

  return (
    <>
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

      {initialDesignName ? (
        <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Opened your saved design “{initialDesignName}”. Any changes here won’t alter the saved copy
          until you save again.
        </p>
      ) : null}

      {restored ? (
        <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
          We kept the design you started earlier.{" "}
          <button
            type="button"
            onClick={() => {
              commit(withStarterText(emptyDesign(config.version, firstView), config));
              setRestored(false);
            }}
            className="font-semibold text-brand-700 underline"
          >
            Start again
          </button>
        </p>
      ) : null}

      {config.templates.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-ink">Start from a template</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Sets the colours and wording. Your photo stays as it is.
          </p>
          <div className="gc-hide-scrollbar mt-1.5 flex gap-2 overflow-x-auto pb-1">
            {config.templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                className="shrink-0 rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-left transition hover:border-brand-400"
              >
                <span className="block text-xs font-semibold text-ink-soft">{template.label}</span>
                {template.description ? (
                  <span className="block text-[11px] text-muted">{template.description}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ProgressSteps current={stepIndex} />

      {/* --------------------------------------------------------- canvas ---
          Rendered here only when NOT integrated. When integrated, the live
          preview is the product image itself (rendered by ProductLivePreview
          from the published bridge state), so this panel would only duplicate
          it — the spec requires a single preview. */}
      {!integrated ? (
        <div
          className="relative mt-3 rounded-card border border-line bg-paper p-2"
          {...gestures.handlers}
        >
          {/* No guides for the customer — the preview stays clean, exactly like
              the finished product. They pick areas from the chips/buttons below,
              and their photo or text appears in place. */}
          <CustomizerCanvas
            config={config}
            design={design}
            viewId={design.viewId}
            activeZoneId={activeZone?.id ?? null}
            interactive
            onZoneSelect={setActiveZoneId}
          />

          {/* The reposition handle box sits exactly over the area being moved.
              It only exists while the customer is repositioning, so text carries
              no box the rest of the time. */}
          {reposition && repositionZone ? (
            <div ref={overlayRef} className="pointer-events-none absolute inset-2">
              <RepositionBox
                zone={repositionZone}
                placement={
                  design.zones[reposition]?.kind === "TEXT"
                    ? (design.zones[reposition] as { kind: "TEXT"; text: TextPlacement }).text
                    : null
                }
                overlayRef={overlayRef}
                onChange={(patch, live) => setTextProps(reposition, patch, live)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {reposition ? (
        <div className="mt-2 rounded-card border border-brand-300 bg-brand-50/60 p-3">
          <p className="text-xs font-semibold text-brand-800">Repositioning “{repositionZone?.label}”</p>
          <p className="mt-0.5 text-[11px] text-brand-700">
            Drag the text on the product to move it. Use the round handle to turn it.
          </p>
          <div className="mt-2">
            <p className="text-[11px] font-semibold text-ink-soft">Quick position</p>
            <div className="mt-1 grid w-[92px] grid-cols-3 gap-1">
              {PRESET_GRID.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  aria-label={preset.label}
                  title={preset.label}
                  onClick={() => setTextProps(reposition, { offsetX: preset.x, offsetY: preset.y })}
                  className="flex h-7 items-center justify-center rounded border border-line-strong bg-paper text-ink-soft transition hover:border-brand-400"
                >
                  <span className="text-xs leading-none">{preset.glyph}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Small onClick={() => setTextProps(reposition, { offsetX: 0, offsetY: 0, rotation: 0 })}>
              Reset position
            </Small>
            <button
              type="button"
              onClick={() => setReposition(null)}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {/* View tabs live under the product image when integrated. */}
      {!integrated && config.views.length > 1 ? (
        <div className="gc-hide-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {config.views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setViewId(view.id)}
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

      {/* ---------------------------------------------------------- options */}
      {config.optionGroups.map((group) => {
        // A group revealed only by another choice stays hidden until then.
        if (!isGroupVisible(config, group, design.options)) return null;
        const selected = resolveOption(group, design.options[group.id]);
        return (
          <fieldset key={group.id} className="mt-4">
            <legend className="text-xs font-semibold text-ink">
              {group.label}
              {selected ? <span className="ml-1.5 font-normal text-muted">{selected.label}</span> : null}
            </legend>
            {group.helpText ? (
              <p className="mt-0.5 text-[11px] text-muted">{group.helpText}</p>
            ) : null}

            <div className="mt-1.5 flex flex-wrap gap-2">
              {group.options.map((option) => {
                const active = selected?.id === option.id;
                const swatch = group.kind !== "CHOICE" && option.hex;

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!option.available}
                    aria-pressed={active}
                    /* Named on the control itself rather than conveyed by
                       colour alone, so a swatch works without seeing it. */
                    aria-label={`${option.label}${option.available ? "" : " — out of stock"}`}
                    title={option.label}
                    onClick={() =>
                      commit({ ...design, options: { ...design.options, [group.id]: option.id } })
                    }
                    className={
                      swatch
                        ? `h-9 w-9 rounded-full border-2 transition disabled:opacity-30 ${
                            active ? "border-brand-600 ring-2 ring-brand-200" : "border-line-strong"
                          }`
                        : `rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                            active
                              ? "border-brand-600 bg-brand-50 text-brand-700"
                              : "border-line-strong text-ink-soft hover:border-brand-400"
                          }`
                    }
                    style={swatch ? { background: option.hex ?? undefined } : undefined}
                  >
                    {swatch ? null : (
                      <>
                        {option.label}
                        {option.priceDeltaP !== 0 ? (
                          <span className="ml-1 font-normal">
                            {option.priceDeltaP > 0 ? "+" : "−"}
                            {formatPaise(Math.abs(option.priceDeltaP))}
                          </span>
                        ) : null}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {/* ----------------------------------------------------------- style */}
      <StyleControls config={config} design={design} setStyle={setStyle} />

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
                      // Upload the full-resolution photo, then open the crop /
                      // adjust editor (non-destructive) over it.
                      if (file) void upload(file, activeZone);
                      if (fileRef.current) fileRef.current.value = "";
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
                  <button
                    type="button"
                    onClick={() => setCropCtx({ zoneId: activeZone.id, isNew: false })}
                    className="mt-2 w-full rounded-full border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
                  >
                    Crop / adjust photo
                  </button>
                  <p className="mt-2 text-center text-[11px] text-muted">
                    Drag the photo to move it. Pinch, or hold ⌘/Ctrl and scroll, to zoom.
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                    {config.tools.zoom ? (
                      <>
                        <Small onClick={() => setPhoto(activeZone.id, { scale: activePhoto.scale * 1.1 })}>
                          Zoom in
                        </Small>
                        <Small
                          onClick={() =>
                            setPhoto(activeZone.id, { scale: Math.max(1, activePhoto.scale / 1.1) })
                          }
                        >
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

                  <details className="mt-2 rounded-lg border border-line bg-paper px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
                      Adjust the photo
                    </summary>
                    <div className="mt-2 grid gap-2">
                      {(
                        [
                          ["brightness", "Brightness", 50, 150],
                          ["contrast", "Contrast", 50, 150],
                          ["saturation", "Colour", 0, 200],
                        ] as const
                      ).map(([key, label, min, max]) => (
                        <label key={key} className="grid gap-0.5">
                          <span className="text-[11px] text-muted">
                            {label} {activePhoto[key]}%
                          </span>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            value={activePhoto[key]}
                            onChange={(e) =>
                              setPhoto(activeZone.id, { [key]: Number(e.target.value) }, true)
                            }
                            className="accent-brand-600"
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setPhoto(activeZone.id, { brightness: 100, contrast: 100, saturation: 100 })
                        }
                        className="justify-self-start rounded-lg border border-line-strong px-3 py-1 text-[11px] font-semibold text-ink-soft"
                      >
                        Reset adjustments
                      </button>
                    </div>
                  </details>

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
            (() => {
              const tv = activeValue?.kind === "TEXT" ? activeValue.text : null;
              const hidden = hiddenZones.has(activeZone.id);
              return (
                <div className="grid gap-2.5">
                  {/* Optional areas can be switched off entirely — the wording
                      is kept so turning them back on restores it. */}
                  {!activeZone.required ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-ink">Show “{activeZone.label}”</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!hidden}
                        aria-label={`Show ${activeZone.label}`}
                        onClick={() => setZoneHidden(activeZone.id, !hidden)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${!hidden ? "bg-brand-600" : "bg-field"}`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${!hidden ? "left-[22px]" : "left-0.5"}`}
                        />
                      </button>
                    </div>
                  ) : null}

                  {hidden ? (
                    <p className="text-[11px] text-muted">
                      This text is turned off and won’t appear on the product.
                    </p>
                  ) : (
                    <>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-semibold text-ink">
                          {activeZone.label}
                          {activeZone.required ? <span className="text-danger"> *</span> : null}
                        </span>
                        <input
                          value={tv?.value ?? ""}
                          maxLength={activeZone.maxChars ?? 120}
                          onChange={(e) => setText(activeZone.id, e.target.value)}
                          placeholder={activeZone.defaultText || "Type here"}
                          className="w-full rounded-lg border border-field bg-field-bg px-3 py-2.5 text-sm outline-none focus:border-brand-500"
                        />
                        {activeZone.maxChars ? (
                          <span className="text-[11px] text-muted">
                            {tv?.value.length ?? 0} of {activeZone.maxChars} characters
                          </span>
                        ) : null}
                      </label>

                      {tv ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <Segmented
                              value={tv.align ?? activeZone.align}
                              options={[
                                ["left", "Align left", "⇤"],
                                ["center", "Align centre", "≡"],
                                ["right", "Align right", "⇥"],
                              ]}
                              onPick={(v) =>
                                setTextProps(activeZone.id, { align: v as TextPlacement["align"] })
                              }
                            />
                            <div className="flex gap-1" role="group" aria-label="Text style">
                              <StyleToggle
                                on={!!tv.bold}
                                label="Bold"
                                onClick={() => setTextProps(activeZone.id, { bold: !tv.bold })}
                              >
                                <span className="font-bold">B</span>
                              </StyleToggle>
                              <StyleToggle
                                on={!!tv.italic}
                                label="Italic"
                                onClick={() => setTextProps(activeZone.id, { italic: !tv.italic })}
                              >
                                <span className="italic">I</span>
                              </StyleToggle>
                              <StyleToggle
                                on={!!tv.underline}
                                label="Underline"
                                onClick={() => setTextProps(activeZone.id, { underline: !tv.underline })}
                              >
                                <span className="underline">U</span>
                              </StyleToggle>
                            </div>
                            {/* Mirror, only when the admin allowed the customer to. */}
                            {activeZone.customerCanMirror ? (
                              <div className="flex gap-1" role="group" aria-label="Mirror text">
                                <StyleToggle
                                  on={!!tv.mirrorH}
                                  label="Mirror horizontally"
                                  onClick={() => setTextProps(activeZone.id, { mirrorH: !tv.mirrorH })}
                                >
                                  <span aria-hidden="true">↔</span>
                                </StyleToggle>
                                <StyleToggle
                                  on={!!tv.mirrorV}
                                  label="Mirror vertically"
                                  onClick={() => setTextProps(activeZone.id, { mirrorV: !tv.mirrorV })}
                                >
                                  <span aria-hidden="true">↕</span>
                                </StyleToggle>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-ink">Size</span>
                            <div className="flex items-center rounded-lg border border-line-strong">
                              <button
                                type="button"
                                aria-label="Smaller"
                                onClick={() =>
                                  setTextProps(activeZone.id, {
                                    fontSizePct: clampSize((tv.fontSizePct ?? activeZone.fontSizePct) - 1),
                                  })
                                }
                                className="px-3 py-1.5 text-sm leading-none text-ink"
                              >
                                −
                              </button>
                              <span className="min-w-9 text-center text-xs font-semibold tabular-nums">
                                {Math.round(tv.fontSizePct ?? activeZone.fontSizePct)}
                              </span>
                              <button
                                type="button"
                                aria-label="Larger"
                                onClick={() =>
                                  setTextProps(activeZone.id, {
                                    fontSizePct: clampSize((tv.fontSizePct ?? activeZone.fontSizePct) + 1),
                                  })
                                }
                                className="px-3 py-1.5 text-sm leading-none text-ink"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-ink">Position</span>
                            <Small
                              onClick={() =>
                                setReposition(reposition === activeZone.id ? null : activeZone.id)
                              }
                            >
                              {reposition === activeZone.id ? "Finish reposition" : "↔ Reposition"}
                            </Small>
                            {tv.offsetX || tv.offsetY || tv.rotation ? (
                              <Small
                                onClick={() =>
                                  setTextProps(activeZone.id, { offsetX: 0, offsetY: 0, rotation: 0 })
                                }
                              >
                                Reset
                              </Small>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })()
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

      {/* -------------------------------------------------- save to account */}
      {personalised ? (
        <div className="mt-4 border-t border-line pt-3">
          {signedIn ? (
            saveState === "done" ? (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                Saved to your account.{" "}
                <Link href="/account/designs" className="font-semibold text-brand-700 underline">
                  View saved designs
                </Link>
                <button
                  type="button"
                  onClick={() => setSaveState("idle")}
                  className="ml-2 font-semibold text-brand-700 underline"
                >
                  Save another
                </button>
              </p>
            ) : saveName !== null ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  maxLength={120}
                  placeholder="Name this design"
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-field bg-field-bg px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  disabled={saveState === "saving" || saveName.trim() === ""}
                  onClick={() => saveDesign(saveName.trim())}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {saveState === "saving" ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaveName(null);
                    setSaveError(null);
                  }}
                  className="rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold text-ink-soft"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSaveName(initialDesignName ?? productName)}
                className="w-full rounded-lg border border-line-strong bg-paper px-4 py-2 text-xs font-semibold text-ink-soft transition hover:border-brand-400"
              >
                Save this design to my account
              </button>
            )
          ) : (
            <p className="text-xs text-muted">
              <Link href="/login" className="font-semibold text-brand-700 underline">
                Sign in
              </Link>{" "}
              to save this design and come back to it later.
            </p>
          )}
          {saveError ? (
            <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------ your customisation */}
      {personalised ? (
        <CustomizationSummary
          config={config}
          design={design}
          onEdit={(id) => {
            setReposition(null);
            setActiveZoneId(id);
          }}
        />
      ) : null}

      {config.customizationFeeP > 0 || config.optionGroups.length > 0 ? (
        <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          <Row label={productName}>{formatPaise(basePriceP)}</Row>
          {config.customizationFeeP > 0 ? (
            <Row label="Personalisation">
              {personalised ? formatPaise(config.customizationFeeP) : "—"}
            </Row>
          ) : null}
          {config.optionGroups.map((group) => {
            if (!isGroupVisible(config, group, design.options)) return null;
            const option = resolveOption(group, design.options[group.id]);
            if (!option || option.priceDeltaP === 0) return null;
            return (
              <Row key={group.id} label={`${group.label}: ${option.label}`}>
                {option.priceDeltaP > 0 ? "+" : "−"}
                {formatPaise(Math.abs(option.priceDeltaP))}
              </Row>
            );
          })}
          <Row label="Total" strong>
            {formatPaise(totalP)}
          </Row>
        </dl>
      ) : null}
    </section>

    {cropCtx ? (() => {
      const z = config.zones.find((zz) => zz.id === cropCtx.zoneId);
      const v = design.zones[cropCtx.zoneId];
      if (!z || v?.kind !== "PHOTO") return null;
      const p = v.photo;
      return (
        <PhotoCropModal
          imageUrl={`/api/uploads/${p.uploadId}`}
          aspect={z.height > 0 ? z.width / z.height : 1}
          initial={{ offsetX: p.offsetX, offsetY: p.offsetY, scale: p.scale, fit: p.fit ?? "cover" }}
          onCancel={() => {
            // A fresh upload cancelled → discard it. A re-edit → leave as it was.
            if (cropCtx.isNew) {
              commit({
                ...design,
                zones: Object.fromEntries(
                  Object.entries(design.zones).filter(([k]) => k !== cropCtx.zoneId),
                ),
              });
            }
            setCropCtx(null);
          }}
          onApply={(r) => {
            setPhoto(cropCtx.zoneId, r);
            setCropCtx(null);
          }}
        />
      );
    })() : null}
    </>
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
/**
 * Seeds the admin's default wording, so a fresh design opens on the product
 * exactly as it was designed — the same text the admin typed into each area —
 * and the customer edits from there rather than starting on a blank plate.
 *
 * Only areas the admin actually gave a default get one, and existing content is
 * never overwritten, so this is safe to run over any starting design (though we
 * only call it for a brand-new one). The customer's own text later replaces the
 * default, and the server still enforces required areas on add-to-cart.
 */
function withStarterText(design: CustomerDesign, config: CustomizerConfig): CustomerDesign {
  const zones = { ...design.zones };
  for (const zone of config.zones) {
    if (zone.kind !== "TEXT") continue;
    if (zones[zone.id]) continue;
    // Match the admin's Frame Designer preview exactly: it fills every text area
    // with its default text, or the area's label when no default was set. So the
    // customer opens on the same composition the admin sees on the edit page,
    // then edits from there.
    const seed = zone.defaultText && zone.defaultText.trim() ? zone.defaultText : zone.label;
    if (!seed || !seed.trim()) continue;
    zones[zone.id] = { kind: "TEXT", text: { value: seed } };
  }
  return { ...design, zones };
}

/**
 * Fills in any option group the design has not chosen yet.
 *
 * Done when the design is created rather than in an effect: the component is
 * mounted client-only, so the first render can already know the defaults, and
 * the preview and price are never briefly in an unchosen state.
 */
function withDefaultOptions(design: CustomerDesign, config: CustomizerConfig): CustomerDesign {
  const options = { ...design.options };
  for (const group of config.optionGroups) {
    if (options[group.id]) continue;
    const first = resolveOption(group, undefined);
    if (first) options[group.id] = first.id;
  }
  return { ...design, options };
}

/**
 * Fills in the customer's styling with the admin's defaults, for anything the
 * customer has not yet chosen. Like the option defaults, done at creation so
 * the first render already reflects the template's intended look.
 */
function withDefaultStyle(design: CustomerDesign, config: CustomizerConfig): CustomerDesign {
  const co = config.customerOptions;
  const style: DesignStyle = { ...design.style };
  if (co.frameColor.enabled && style.frameColor === undefined && co.frameColor.default) {
    style.frameColor = co.frameColor.default;
  }
  if (co.textColor.enabled && style.textColor === undefined && co.textColor.default) {
    style.textColor = co.textColor.default;
  }
  if (co.font.enabled && style.fontFamily === undefined && co.font.default) {
    style.fontFamily = co.font.default;
  }
  if (co.textSize.enabled && style.textSizePx === undefined && co.textSize.default) {
    style.textSizePx = co.textSize.default;
  }
  if (co.ledGlow.enabled && style.ledOn === undefined) style.ledOn = true;
  if (co.gradient.enabled && style.gradientOn === undefined) style.gradientOn = false;
  return { ...design, style };
}

/**
 * Prepares a design opened from the account to run against the current config.
 *
 * The product may have been republished since the design was saved, so the
 * view it remembers might no longer exist; fall back to the first view rather
 * than open on a blank canvas. Zones the product no longer has simply do not
 * render and are dropped on add-to-cart, so they need no handling here.
 */
function normaliseLoaded(
  design: CustomerDesign | null,
  config: CustomizerConfig,
  firstView: string,
): CustomerDesign | null {
  if (!design) return null;
  const viewId = config.views.some((v) => v.id === design.viewId) ? design.viewId : firstView;
  return { ...design, viewId };
}

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

/**
 * The customer's global styling controls — only the ones the admin turned on,
 * each drawn from an allowed set. Writing to `design.style`, which the canvas
 * and the production render both read, so what the customer picks here is what
 * gets made.
 */
function StyleControls({
  config,
  design,
  setStyle,
}: {
  config: CustomizerConfig;
  design: CustomerDesign;
  setStyle: (patch: Partial<DesignStyle>) => void;
}) {
  const co = config.customerOptions;
  const s = design.style;

  const showFrame = co.frameColor.enabled && co.frameColor.colors.length > 0;
  const showText = co.textColor.enabled && co.textColor.colors.length > 0;
  const showFont = co.font.enabled && co.font.families.length > 0;
  const showSize = co.textSize.enabled && co.textSize.choices.length > 0;
  const showGradient = co.gradient.enabled;
  const showLed = co.ledGlow.enabled;

  /* The first photo the customer has placed, used to generate gradient colours
     from it. Served same-origin so the colour reader can sample its pixels. */
  const photoValue = Object.values(design.zones).find(
    (v): v is Extract<typeof v, { kind: "PHOTO" }> => v.kind === "PHOTO" && Boolean(v.photo.uploadId),
  );
  const photoUrl = photoValue ? `/api/uploads/${photoValue.photo.uploadId}` : null;

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function generateFromPhoto() {
    if (!photoUrl) return;
    setGenerating(true);
    setGenError(null);
    const pair = await dominantGradient(photoUrl);
    if (pair) setStyle({ gradientColor1: pair[0], gradientColor2: pair[1], gradientOn: true });
    else setGenError("Couldn’t read colours from that photo — pick colours below instead.");
    setGenerating(false);
  }

  if (!showFrame && !showText && !showFont && !showSize && !showGradient && !showLed) return null;

  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4">
      {showFrame ? (
        <Swatches
          label="Frame colour"
          colors={co.frameColor.colors}
          selected={s.frameColor}
          onPick={(c) => setStyle({ frameColor: c })}
        />
      ) : null}

      {showText ? (
        <Swatches
          label="Text colour"
          colors={co.textColor.colors}
          selected={s.textColor}
          onPick={(c) => setStyle({ textColor: c })}
        />
      ) : null}

      {showFont ? (
        <fieldset>
          <legend className="text-xs font-semibold text-ink">Font</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {co.font.families.map((f) => {
              const active = (s.fontFamily ?? co.font.default) === f.name;
              return (
                <button
                  key={f.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStyle({ fontFamily: f.name })}
                  style={{ fontFamily: fontStack(f.name) }}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-line-strong text-ink-soft hover:border-brand-400"
                  }`}
                >
                  {f.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {showSize ? (
        <fieldset>
          <legend className="text-xs font-semibold text-ink">Text size</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {co.textSize.choices.map((c) => {
              const active = (s.textSizePx ?? co.textSize.default) === c.px;
              return (
                <button
                  key={`${c.label}-${c.px}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStyle({ textSizePx: c.px })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-line-strong text-ink-soft hover:border-brand-400"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {showGradient ? (
        <div className="grid gap-2">
          <Toggle
            label="Gradient"
            on={s.gradientOn ?? false}
            onToggle={(on) => setStyle({ gradientOn: on })}
          />
          {s.gradientOn ? (
            <div className="grid gap-2.5 rounded-lg border border-line bg-paper p-3">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                  Colour 1
                  <input
                    type="color"
                    aria-label="Gradient colour 1"
                    value={s.gradientColor1 ?? co.gradient.color1}
                    onChange={(e) => setStyle({ gradientColor1: e.target.value })}
                    className="h-7 w-10 cursor-pointer rounded border border-line-strong bg-transparent"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                  Colour 2
                  <input
                    type="color"
                    aria-label="Gradient colour 2"
                    value={s.gradientColor2 ?? co.gradient.color2}
                    onChange={(e) => setStyle({ gradientColor2: e.target.value })}
                    className="h-7 w-10 cursor-pointer rounded border border-line-strong bg-transparent"
                  />
                </label>
                {s.gradientColor1 || s.gradientColor2 ? (
                  <button
                    type="button"
                    onClick={() => setStyle({ gradientColor1: undefined, gradientColor2: undefined })}
                    className="text-xs font-semibold text-brand-700 hover:underline"
                  >
                    Reset colours
                  </button>
                ) : null}
              </div>

              {photoUrl ? (
                <div>
                  <button
                    type="button"
                    onClick={generateFromPhoto}
                    disabled={generating}
                    className="rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
                  >
                    {generating ? "Reading colours…" : "✨ Generate colours from my photo"}
                  </button>
                  {genError ? <p className="mt-1 text-[11px] font-medium text-danger">{genError}</p> : null}
                </div>
              ) : null}

              <Toggle
                label="Apply gradient to all photos"
                on={s.gradientAllPhotos ?? false}
                onToggle={(on) => setStyle({ gradientAllPhotos: on })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {showLed ? (
        <Toggle label="LED glow" on={s.ledOn ?? true} onToggle={(on) => setStyle({ ledOn: on })} />
      ) : null}
    </div>
  );
}

function Swatches({
  label,
  colors,
  selected,
  onPick,
}: {
  label: string;
  colors: string[];
  selected: string | undefined;
  onPick: (color: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold text-ink">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {colors.map((c) => {
          const active = selected === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              aria-label={c}
              title={c}
              onClick={() => onPick(c)}
              className={`h-9 w-9 rounded-full border-2 transition ${
                active ? "border-brand-600 ring-2 ring-brand-200" : "border-line-strong"
              }`}
              style={{ background: c }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

function Toggle({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-semibold text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onToggle(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand-600" : "bg-field"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
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

/* The nine quick-position presets, as offsets (percent of the area from its
   centre). The middle one recentres. */
const PRESET_GRID: { label: string; glyph: string; x: number; y: number }[] = [
  { label: "Top left", glyph: "↖", x: -40, y: -40 },
  { label: "Top", glyph: "↑", x: 0, y: -40 },
  { label: "Top right", glyph: "↗", x: 40, y: -40 },
  { label: "Left", glyph: "←", x: -40, y: 0 },
  { label: "Centre", glyph: "•", x: 0, y: 0 },
  { label: "Right", glyph: "→", x: 40, y: 0 },
  { label: "Bottom left", glyph: "↙", x: -40, y: 40 },
  { label: "Bottom", glyph: "↓", x: 0, y: 40 },
  { label: "Bottom right", glyph: "↘", x: 40, y: 40 },
];

function clampSize(n: number) {
  return Math.min(80, Math.max(4, Math.round(n)));
}

/** A four-step, honest indicator of where the customer is in the flow. */
function ProgressSteps({ current }: { current: number }) {
  const labels = ["Product", "Personalise", "Preview", "Add to cart"];
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] font-semibold">
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-1">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                done
                  ? "bg-brand-600 text-white"
                  : active
                    ? "bg-brand-100 text-brand-700 ring-1 ring-brand-500"
                    : "bg-field text-muted"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={active ? "text-brand-700" : done ? "text-ink-soft" : "text-muted"}>{label}</span>
            {i < labels.length - 1 ? (
              <span className="mx-0.5 h-px w-3 bg-line-strong" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** A small segmented control (used for text alignment). */
function Segmented({
  value,
  options,
  onPick,
}: {
  value: string;
  options: [string, string, string][];
  onPick: (value: string) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-line-strong" role="group">
      {options.map(([val, label, glyph], i) => {
        const active = value === val;
        return (
          <button
            key={val}
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={() => onPick(val)}
            className={`px-2.5 py-1.5 text-xs leading-none ${i > 0 ? "border-l border-line-strong" : ""} ${
              active ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-brand-50"
            }`}
          >
            {glyph}
          </button>
        );
      })}
    </div>
  );
}

/** A single bold/italic/underline toggle. */
function StyleToggle({
  on,
  label,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`h-8 w-8 rounded-lg border text-sm transition ${
        on
          ? "border-brand-600 bg-brand-50 text-brand-700"
          : "border-line-strong text-ink-soft hover:border-brand-400"
      }`}
    >
      {children}
    </button>
  );
}

/** A plain-language recap of everything the customer has set, each row linking
 *  back to the area it describes. */
function CustomizationSummary({
  config,
  design,
  onEdit,
}: {
  config: CustomizerConfig;
  design: CustomerDesign;
  onEdit: (zoneId: string) => void;
}) {
  const items = config.zones
    .map((z) => {
      const v = design.zones[z.id];
      if (!v) return null;
      if (z.kind === "TEXT" && v.kind === "TEXT" && v.text.value.trim()) {
        const style = resolveTextStyle(config, z, design);
        return {
          id: z.id,
          label: z.label,
          kind: "TEXT" as const,
          value: v.text.value,
          color: v.text.color ?? style.color,
          font: v.text.fontFamily ?? style.fontFamily,
          size: Math.round(v.text.fontSizePct ?? style.fontSizePct),
          moved: Boolean(v.text.offsetX || v.text.offsetY || v.text.rotation),
        };
      }
      if (z.kind === "PHOTO" && v.kind === "PHOTO" && v.photo.uploadId) {
        return { id: z.id, label: z.label, kind: "PHOTO" as const };
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (items.length === 0) return null;

  return (
    <div className="mt-4 rounded-card border border-line bg-paper p-3">
      <p className="text-xs font-semibold text-ink">Your customisation</p>
      <dl className="mt-2 grid gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold text-ink-soft">{it.label}</dt>
              {it.kind === "TEXT" ? (
                <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                  <span
                    className="max-w-[14rem] truncate font-medium text-ink"
                    style={{ fontFamily: fontStack(it.font) }}
                  >
                    “{it.value}”
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-3 w-3 rounded-full border border-line-strong"
                      style={{ background: it.color }}
                    />
                    {it.font}
                  </span>
                  <span>· size {it.size}</span>
                  {it.moved ? <span>· moved</span> : null}
                </dd>
              ) : (
                <dd className="mt-0.5 text-[11px] text-muted">Photo added</dd>
              )}
            </div>
            <button
              type="button"
              onClick={() => onEdit(it.id)}
              className="shrink-0 rounded-lg border border-line-strong px-2.5 py-1 text-[11px] font-semibold text-ink-soft transition hover:border-brand-400"
            >
              Edit
            </button>
          </div>
        ))}
      </dl>
    </div>
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

/**
 * The zoom a freshly uploaded photo starts at.
 *
 * Always 1: the canvas covers the zone with object-fit, so scale 1 already
 * fills it with the photo's own proportions intact, whatever shape it is.
 * An earlier version scaled by the ratio between photo and zone, which only
 * made a stretched image bigger.
 */
function startingScale() {
  return 1;
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
