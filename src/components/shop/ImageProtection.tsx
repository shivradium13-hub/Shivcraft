"use client";

import { useEffect } from "react";

/**
 * Deters casual copying of storefront images: blocks the right-click "Save
 * image" menu, drag-to-save, and the iOS/Android long-press save callout.
 *
 * This is a DETERRENT, not a guarantee — any image the browser has rendered can
 * still be captured by a determined visitor (screenshot, dev-tools, or the
 * image URL straight from the network tab). There is no way to prevent that
 * while still showing the picture. What this stops is the one-click casual
 * download that the vast majority of people would use.
 *
 * Mounted on the storefront only (via ShopShell), so the admin keeps full
 * right-click / drag behaviour for managing images.
 */
export function ImageProtection() {
  useEffect(() => {
    // The CSS half of the protection (drag/select/callout) keys off this class,
    // so it only applies while a storefront page is mounted.
    document.body.classList.add("gc-protect");

    // Real form fields are exempt so right-click paste still works at checkout.
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      el.closest("input, textarea, select, [contenteditable='true']") !== null;

    const onContextMenu = (e: MouseEvent) => {
      if (isField(e.target)) return;
      e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      if (e.target instanceof HTMLImageElement) e.preventDefault();
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    return () => {
      document.body.classList.remove("gc-protect");
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  return null;
}
