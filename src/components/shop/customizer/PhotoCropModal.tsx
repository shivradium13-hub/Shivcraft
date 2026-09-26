"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * The photo crop / adjust editor (matches the "Crop Photo" mockup).
 *
 * Non-destructive: it never re-encodes the picture. It edits the same placement
 * the product preview uses — offset, zoom and a Fit/Fill choice — so the full
 * original stays at print resolution, re-opening restores the exact position and
 * zoom, and what the frame shows here is what the product shows.
 *
 * The whole photo stays visible (no auto-crop); the crop frame is the product's
 * shape and everything outside it is dimmed. Cover fills and crops to the frame;
 * Fit shows the whole photo inside it with the background around.
 */
export type CropResult = {
  offsetX: number;
  offsetY: number;
  scale: number;
  fit: "cover" | "contain";
};

export function PhotoCropModal({
  imageUrl,
  aspect,
  initial,
  onCancel,
  onApply,
}: {
  imageUrl: string;
  /** The crop frame's width / height, from the target shape. */
  aspect: number;
  initial: CropResult;
  onCancel: () => void;
  onApply: (result: CropResult) => void;
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [offsetX, setOffsetX] = useState(initial.offsetX);
  const [offsetY, setOffsetY] = useState(initial.offsetY);
  const [scale, setScale] = useState(Math.max(1, initial.scale || 1));
  const [fit, setFit] = useState<"cover" | "contain">(initial.fit ?? "cover");
  const [error, setError] = useState<string | null>(null);

  const viewRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setError("That photo could not be loaded.");
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* The crop frame, centred in the viewport with a margin, at the shape aspect. */
  const frame = useMemo(() => {
    const pad = 28;
    const availW = Math.max(0, view.w - pad * 2);
    const availH = Math.max(0, view.h - pad * 2);
    if (availW <= 0 || availH <= 0) return { w: 0, h: 0, left: 0, top: 0 };
    let fw = availW;
    let fh = fw / aspect;
    if (fh > availH) {
      fh = availH;
      fw = fh * aspect;
    }
    return { w: fw, h: fh, left: (view.w - fw) / 2, top: (view.h - fh) / 2 };
  }, [view, aspect]);

  const baseScale = useMemo(() => {
    if (!nat || frame.w === 0) return 1;
    return fit === "cover"
      ? Math.max(frame.w / nat.w, frame.h / nat.h)
      : Math.min(frame.w / nat.w, frame.h / nat.h);
  }, [nat, frame, fit]);

  const ds = baseScale * scale;
  const imgW = nat ? nat.w * ds : 0;
  const imgH = nat ? nat.h * ds : 0;

  /** Keep the placement sensible: cover always fills the frame, fit stays inside. */
  function clampOffset(oxPct: number, oyPct: number) {
    if (frame.w === 0) return { x: oxPct, y: oyPct };
    const limX = fit === "cover" ? Math.max(0, (imgW - frame.w) / 2) : Math.max(0, (frame.w - imgW) / 2);
    const limY = fit === "cover" ? Math.max(0, (imgH - frame.h) / 2) : Math.max(0, (frame.h - imgH) / 2);
    const oxPx = Math.min(limX, Math.max(-limX, (oxPct / 100) * frame.w));
    const oyPx = Math.min(limY, Math.max(-limY, (oyPct / 100) * frame.h));
    return { x: (oxPx / frame.w) * 100, y: (oyPx / frame.h) * 100 };
  }

  function reclamp(nextScale = scale, nextFit = fit) {
    // Recompute limits when zoom/fit change so the image never drifts off.
    const bs = nat && frame.w ? (nextFit === "cover" ? Math.max(frame.w / nat.w, frame.h / nat.h) : Math.min(frame.w / nat.w, frame.h / nat.h)) : 1;
    const w = nat ? nat.w * bs * nextScale : 0;
    const h = nat ? nat.h * bs * nextScale : 0;
    const limX = nextFit === "cover" ? Math.max(0, (w - frame.w) / 2) : Math.max(0, (frame.w - w) / 2);
    const limY = nextFit === "cover" ? Math.max(0, (h - frame.h) / 2) : Math.max(0, (frame.h - h) / 2);
    setOffsetX((ox) => ((Math.min(limX, Math.max(-limX, (ox / 100) * frame.w))) / frame.w) * 100 || 0);
    setOffsetY((oy) => ((Math.min(limY, Math.max(-limY, (oy / 100) * frame.h))) / frame.h) * 100 || 0);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      const p = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), scale };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const p = [...pointers.current.values()];
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinch.current.dist > 0) setZoom(pinch.current.scale * (dist / pinch.current.dist));
      return;
    }
    if (drag.current && frame.w > 0) {
      const dxPct = ((e.clientX - drag.current.x) / frame.w) * 100;
      const dyPct = ((e.clientY - drag.current.y) / frame.h) * 100;
      const c = clampOffset(drag.current.ox + dxPct, drag.current.oy + dyPct);
      setOffsetX(c.x);
      setOffsetY(c.y);
    }
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y, ox: offsetX, oy: offsetY };
    } else if (pointers.current.size === 0) {
      drag.current = null;
    }
  }

  function setZoom(z: number) {
    const nz = Math.min(4, Math.max(1, z));
    setScale(nz);
    reclamp(nz, fit);
  }

  function chooseFit(f: "cover" | "contain") {
    setFit(f);
    reclamp(scale, f);
  }

  const imgStyle: React.CSSProperties =
    nat && frame.w > 0
      ? {
          position: "absolute",
          width: imgW,
          height: imgH,
          left: frame.left + frame.w / 2 - imgW / 2 + (offsetX / 100) * frame.w,
          top: frame.top + frame.h / 2 - imgH / 2 + (offsetY / 100) * frame.h,
          maxWidth: "none",
        }
      : { visibility: "hidden" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop photo"
      className="fixed inset-0 z-[70] flex flex-col bg-[#0b0d16] text-white"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onCancel} aria-label="Back" className="text-lg leading-none">
          ‹
        </button>
        <p className="text-sm font-semibold">Crop Photo</p>
      </div>

      <div
        ref={viewRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(e) => setZoom(scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        style={{ touchAction: "none" }}
        className="relative min-h-0 flex-1 cursor-move overflow-hidden select-none"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" draggable={false} style={imgStyle} />
        ) : null}

        {/* Crop frame: dims everything outside it, with a rule-of-thirds grid. */}
        {frame.w > 0 ? (
          <div
            className="pointer-events-none absolute"
            style={{
              left: frame.left,
              top: frame.top,
              width: frame.w,
              height: frame.h,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
              outline: "2px solid rgba(255,255,255,0.9)",
            }}
          >
            <div className="grid h-full w-full grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/25" />
              ))}
            </div>
          </div>
        ) : null}

        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/55 px-3 py-1.5 text-center text-[11px]">
          Drag to move · Pinch to zoom
          <span className="block text-white/70">Photo ko apne hisaab se set karein</span>
        </div>
        {error ? (
          <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded bg-danger px-3 py-1 text-xs">{error}</p>
        ) : null}
      </div>

      <div className="space-y-3 px-4 pt-3 pb-4">
        {/* Fit / Fill */}
        <div>
          <div className="flex gap-1.5 rounded-lg bg-white/10 p-1">
            <button
              type="button"
              onClick={() => chooseFit("cover")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${fit === "cover" ? "bg-white text-ink" : "text-white/80"}`}
            >
              Fill (Crop)
            </button>
            <button
              type="button"
              onClick={() => chooseFit("contain")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${fit === "contain" ? "bg-white text-ink" : "text-white/80"}`}
            >
              Fit (Show Full)
            </button>
          </div>
          <p className="mt-1 text-center text-[11px] text-white/60">
            {fit === "contain"
              ? "Whole photo shown, with background around it."
              : "Photo fills the shape; edges outside are cropped."}
          </p>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Zoom</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={scale}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[#2f6bff]"
          />
          <span className="w-11 text-right text-xs tabular-nums text-white/80">
            {Math.round(scale * 100)}%
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!nat}
            onClick={() => onApply({ offsetX, offsetY, scale, fit })}
            className="flex-1 rounded-lg bg-[#2f6bff] px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            Crop &amp; Use
          </button>
        </div>
      </div>
    </div>
  );
}
