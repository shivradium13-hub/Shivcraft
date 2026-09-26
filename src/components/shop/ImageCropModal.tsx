"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * A crop-before-insert modal used everywhere an image is uploaded (customer and
 * admin). The picture sits behind a fixed crop window and the person pans and
 * zooms it; Apply extracts the window at source resolution.
 *
 * Cover-crop, not free-transform: the window is always fully covered, so the
 * result never has empty edges, the aspect is preserved (never stretched), and
 * the export is drawn from the original pixels — quality and PNG transparency
 * are kept. Works with mouse (drag + wheel) and touch (drag + pinch).
 */
export function ImageCropModal({
  file,
  aspect = null,
  onCancel,
  onApply,
}: {
  file: File;
  /** Crop-window aspect (w/h). Null uses the image's own aspect, so with no
   *  zoom the whole picture is kept and the person only trims if they choose. */
  aspect?: number | null;
  onCancel: () => void;
  onApply: (result: File) => void;
}) {
  const [url] = useState<string>(() => URL.createObjectURL(file));
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  /** Crop-window centre in natural image pixels. */
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
      setCenter({ x: img.naturalWidth / 2, y: img.naturalHeight / 2 });
    };
    img.onerror = () => setError("That image could not be read. Try another file.");
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const cropAspect = aspect ?? (nat ? nat.w / nat.h : 1);

  /** The crop window size in natural px at the current zoom (largest window that
   *  fits the image for this aspect, divided by zoom). */
  function windowSize(): { w: number; h: number } {
    if (!nat) return { w: 0, h: 0 };
    const baseW = nat.w / nat.h > cropAspect ? nat.h * cropAspect : nat.w;
    const baseH = baseW / cropAspect;
    return { w: baseW / zoom, h: baseH / zoom };
  }

  /** Keeps the crop window inside the image. */
  function clampCenter(c: { x: number; y: number }, win: { w: number; h: number }) {
    if (!nat) return c;
    return {
      x: Math.min(nat.w - win.w / 2, Math.max(win.w / 2, c.x)),
      y: Math.min(nat.h - win.h / 2, Math.max(win.h / 2, c.y)),
    };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      // Two fingers → start a pinch; stop panning.
      const pts = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom };
      drag.current = null;
    } else if (center) {
      drag.current = { x: e.clientX, y: e.clientY, cx: center.x, cy: center.y };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!nat || !center) return;
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const view = viewRef.current?.getBoundingClientRect();
    if (!view) return;

    // Pinch-zoom when two fingers are down.
    if (pinch.current && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch.current.dist > 0) setZoomClamped(pinch.current.zoom * (dist / pinch.current.dist));
      return;
    }

    const win = windowSize();
    // Display px → natural px: the window maps to the viewport width.
    const natPerPx = win.w / view.width;
    if (drag.current) {
      const dx = (e.clientX - drag.current.x) * natPerPx;
      const dy = (e.clientY - drag.current.y) * natPerPx;
      setCenter(clampCenter({ x: drag.current.cx - dx, y: drag.current.cy - dy }, win));
    }
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1 && center) {
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y, cx: center.x, cy: center.y };
    } else if (pointers.current.size === 0) {
      drag.current = null;
    }
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    setZoomClamped(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  function setZoomClamped(z: number) {
    const nz = Math.min(6, Math.max(1, z));
    setZoom(nz);
    if (center) setCenter((c) => (c ? clampCenter(c, { w: (nat!.w / nat!.h > cropAspect ? nat!.h * cropAspect : nat!.w) / nz, h: ((nat!.w / nat!.h > cropAspect ? nat!.h * cropAspect : nat!.w) / cropAspect) / nz }) : c));
  }

  async function apply() {
    if (!imgRef.current || !nat || !center) return;
    setBusy(true);
    setError(null);
    try {
      const win = windowSize();
      const cx = center.x - win.w / 2;
      const cy = center.y - win.h / 2;
      const canvas = document.createElement("canvas");
      // Output at source resolution (no upscaling) so quality is preserved.
      canvas.width = Math.round(win.w);
      canvas.height = Math.round(win.h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no ctx");
      // PNG/WebP keep transparency; a transparent JPEG would go black, so those
      // stay in their own format and only true JPEGs export as JPEG.
      const type = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
      ctx.drawImage(imgRef.current, cx, cy, win.w, win.h, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, type, type === "image/jpeg" ? 0.92 : undefined),
      );
      if (!blob) throw new Error("no blob");
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      onApply(new File([blob], `${base}-cropped.${ext}`, { type }));
    } catch {
      setError("Could not crop that image. Try again.");
      setBusy(false);
    }
  }

  // Live preview metrics.
  const win = windowSize();
  const view = viewRef.current?.getBoundingClientRect();
  let imgStyle: React.CSSProperties = { visibility: "hidden" };
  if (nat && center && view && win.w > 0) {
    const displayScale = view.width / win.w;
    imgStyle = {
      position: "absolute",
      width: nat.w * displayScale,
      height: nat.h * displayScale,
      left: -((center.x - win.w / 2) * displayScale),
      top: -((center.y - win.h / 2) * displayScale),
      maxWidth: "none",
    };
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop image"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/80 p-3 sm:p-6"
      onClick={onCancel}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-card bg-canvas"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <p className="text-sm font-semibold text-ink">Crop image</p>
          <button type="button" onClick={onCancel} className="text-xs font-semibold text-muted">
            Cancel
          </button>
        </div>

        <div className="p-4">
          <div
            ref={viewRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={onWheel}
            style={{ aspectRatio: String(cropAspect), touchAction: "none" }}
            className="relative w-full cursor-move overflow-hidden rounded-lg border border-line-strong bg-[repeating-conic-gradient(#e7e7e9_0%_25%,#fff_0%_50%)] bg-[length:20px_20px] select-none"
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" draggable={false} style={imgStyle} />
            ) : null}
            {/* A subtle grid so the crop is visually clear. */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/30" />
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-ink">Zoom</span>
            <input
              type="range"
              min={1}
              max={6}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoomClamped(Number(e.target.value))}
              className="flex-1 accent-brand-600"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted">Drag to move · pinch or scroll to zoom.</p>

          {error ? <p className="mt-2 text-xs font-medium text-danger">{error}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              if (nat) setCenter({ x: nat.w / 2, y: nat.h / 2 });
            }}
            className="rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold text-ink-soft"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold text-ink-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !nat}
            onClick={apply}
            className="ml-auto rounded-lg bg-brand-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Applying…" : "Apply crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
