"use client";

import { useRef, type PointerEvent } from "react";

import type { TextPlacement } from "@/lib/customizer/design";
import type { CustomizerZone } from "@/lib/customizer/schema";

function clampOffset(n: number) {
  return Math.min(50, Math.max(-50, Math.round(n)));
}

function clampRot(n: number) {
  const wrapped = (((n + 180) % 360) + 360) % 360 - 180;
  return Math.round(wrapped);
}

/**
 * The handle box the customer drags to place text inside its area.
 *
 * It is drawn exactly over the area (same percentage coordinates the canvas
 * uses), and only exists while repositioning — so text carries no box the rest
 * of the time. A drag moves the wording within the area (offset is a percentage
 * of the area, clamped so it stays on the product); the round handle turns it.
 * Moves are live, with a single history entry taken at the start of the gesture.
 *
 * `overlayRef` is the element the box is positioned within (the canvas box), used
 * to convert a pixel drag into a percentage of the area, so it works wherever
 * the live preview is rendered.
 */
export function RepositionBox({
  zone,
  placement,
  overlayRef,
  onChange,
}: {
  zone: CustomizerZone;
  placement: TextPlacement | null;
  overlayRef: { current: HTMLDivElement | null };
  onChange: (patch: Partial<TextPlacement>, live?: boolean) => void;
}) {
  const drag = useRef<{
    mode: "move" | "rotate";
    startX: number;
    startY: number;
    ox: number;
    oy: number;
    rectW: number;
    rectH: number;
    cx: number;
    cy: number;
  } | null>(null);

  const begin = (e: PointerEvent<HTMLDivElement>, mode: "move" | "rotate") => {
    e.preventDefault();
    e.stopPropagation();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Snapshot one history step before the gesture, so a single undo takes the
    // whole move or turn back.
    onChange(
      mode === "move"
        ? { offsetX: placement?.offsetX ?? 0, offsetY: placement?.offsetY ?? 0 }
        : { rotation: placement?.rotation ?? 0 },
      false,
    );
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      ox: placement?.offsetX ?? 0,
      oy: placement?.offsetY ?? 0,
      rectW: rect.width,
      rectH: rect.height,
      cx: rect.left + ((zone.x + zone.width / 2) / 100) * rect.width,
      cy: rect.top + ((zone.y + zone.height / 2) / 100) * rect.height,
    };
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      const zw = (d.rectW * zone.width) / 100 || 1;
      const zh = (d.rectH * zone.height) / 100 || 1;
      onChange(
        {
          offsetX: clampOffset(d.ox + ((e.clientX - d.startX) / zw) * 100),
          offsetY: clampOffset(d.oy + ((e.clientY - d.startY) / zh) * 100),
        },
        true,
      );
    } else {
      const deg = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI + 90;
      onChange({ rotation: clampRot(deg) }, true);
    }
  };

  const end = () => {
    drag.current = null;
  };

  return (
    <div
      style={{
        left: `${zone.x}%`,
        top: `${zone.y}%`,
        width: `${zone.width}%`,
        height: `${zone.height}%`,
        transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
      }}
      className="pointer-events-none absolute"
    >
      <div
        onPointerDown={(e) => begin(e, "move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ touchAction: "none" }}
        title="Drag to move"
        className="pointer-events-auto absolute inset-0 cursor-move rounded-sm border-2 border-dashed border-brand-500 bg-brand-500/5"
      />
      <div
        onPointerDown={(e) => begin(e, "rotate")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ touchAction: "none" }}
        title="Drag to rotate"
        className="pointer-events-auto absolute -top-7 left-1/2 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-white bg-brand-600 shadow"
      />
    </div>
  );
}
