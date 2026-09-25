"use client";

import { useCallback, useRef } from "react";

import type { PhotoPlacement } from "@/lib/customizer/design";

/**
 * Drag and pinch for a photo inside its zone.
 *
 * Pointer events rather than separate mouse and touch handlers, so one code
 * path covers a mouse, a finger and a stylus. The element captures the pointer
 * on down, which is what stops a drag breaking when the finger leaves the zone,
 * and `touch-action: none` on the surface stops the page scrolling underneath
 * while the customer is moving their photo (§41).
 *
 * Offsets are percentages of the zone, so a drag means the same thing on a
 * 320px phone preview and a 700px desktop one.
 */
export function usePhotoGestures({
  placement,
  onChange,
  enabled,
}: {
  placement: PhotoPlacement | null;
  onChange: (next: Partial<PhotoPlacement>) => void;
  enabled: boolean;
}) {
  const points = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{
    offsetX: number;
    offsetY: number;
    scale: number;
    distance: number;
    cx: number;
    cy: number;
    width: number;
  } | null>(null);

  const reset = useCallback(() => {
    points.current.clear();
    start.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !placement) return;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const rect = event.currentTarget.getBoundingClientRect();
      const all = [...points.current.values()];
      const cx = all.reduce((s, p) => s + p.x, 0) / all.length;
      const cy = all.reduce((s, p) => s + p.y, 0) / all.length;
      const distance = all.length >= 2 ? Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y) : 0;

      start.current = {
        offsetX: placement.offsetX,
        offsetY: placement.offsetY,
        scale: placement.scale,
        distance,
        cx,
        cy,
        width: rect.width || 1,
      };
    },
    [enabled, placement],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !placement || !start.current) return;
      if (!points.current.has(event.pointerId)) return;

      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const all = [...points.current.values()];
      const base = start.current;

      const cx = all.reduce((s, p) => s + p.x, 0) / all.length;
      const cy = all.reduce((s, p) => s + p.y, 0) / all.length;

      // Pan follows the centre of however many fingers are down.
      const next: Partial<PhotoPlacement> = {
        offsetX: clamp(base.offsetX + ((cx - base.cx) / base.width) * 100, -200, 200),
        offsetY: clamp(base.offsetY + ((cy - base.cy) / base.width) * 100, -200, 200),
      };

      // Pinch is the change in distance between the first two fingers. The floor
      // is 1 (exactly covering the area) so the photo can never be shrunk small
      // enough to leave gaps around it in the frame.
      if (all.length >= 2 && base.distance > 0) {
        const distance = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
        next.scale = clamp(base.scale * (distance / base.distance), 1, 8);
      }

      onChange(next);
    },
    [enabled, placement, onChange],
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    points.current.delete(event.pointerId);
    if (points.current.size === 0) start.current = null;
  }, []);

  /* Ctrl/Cmd + wheel is the browser's own zoom gesture on a trackpad, so it
     maps to zooming the photo; a plain wheel is left alone for page scroll. */
  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!enabled || !placement) return;
      if (!event.ctrlKey && !event.metaKey) return;
      onChange({ scale: clamp(placement.scale * (event.deltaY < 0 ? 1.06 : 0.94), 1, 8) });
    },
    [enabled, placement, onChange],
  );

  return {
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onWheel,
      style: { touchAction: "none" as const },
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
