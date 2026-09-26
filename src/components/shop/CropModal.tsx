"use client";

import Cropper from "cropperjs";
import { useEffect, useRef, useState } from "react";

import "cropperjs/dist/cropper.css";

/**
 * The one crop editor for the whole site — customer uploads, product
 * personalisation and admin frame/image uploads all use this.
 *
 * Matches the reference: a dark overlay, a centred workspace, a resizable crop
 * box with handles over a zoomable/movable image, minimal controls (zoom,
 * rotate, reset) and a clear Cancel / Select. The crop is exported from the
 * original pixels at high quality (PNG/WebP keep transparency; JPEGs stay JPEG),
 * so nothing is needlessly recompressed. The chosen product shape then masks the
 * result at render time — a round frame shows the crop box round here too.
 */
export function CropModal({
  file,
  imageUrl,
  aspectRatio,
  round = false,
  title = "Crop Image",
  onCancel,
  onCropped,
}: {
  /** The freshly picked file to crop (customer/admin upload). */
  file?: File;
  /** Or an existing image URL to re-crop ("Edit image"). */
  imageUrl?: string;
  /** Crop-box aspect (w/h). Undefined / NaN lets the box be any ratio. */
  aspectRatio?: number;
  /** Show the crop box as a circle (for round frames). */
  round?: boolean;
  title?: string;
  onCancel: () => void;
  onCropped: (result: File) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const [src] = useState<string>(() => (file ? URL.createObjectURL(file) : imageUrl ?? ""));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const cropper = new Cropper(img, {
      viewMode: 1,
      dragMode: "move",
      aspectRatio: aspectRatio && aspectRatio > 0 ? aspectRatio : NaN,
      autoCropArea: 0.9,
      background: false,
      modal: true,
      responsive: true,
      checkOrientation: true,
      minContainerHeight: 260,
      ready: () => setReady(true),
    });
    cropperRef.current = cropper;
    return () => {
      cropper.destroy();
      cropperRef.current = null;
      if (file) URL.revokeObjectURL(src);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep ESC-to-close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function select() {
    const cropper = cropperRef.current;
    if (!cropper) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = cropper.getCroppedCanvas({
        maxWidth: 4096,
        maxHeight: 4096,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });
      if (!canvas || canvas.width === 0) throw new Error("empty");
      const type =
        file?.type === "image/png"
          ? "image/png"
          : file?.type === "image/webp"
            ? "image/webp"
            : "image/jpeg";
      const blob: Blob | null = await new Promise((r) =>
        canvas.toBlob(r, type, type === "image/jpeg" ? 0.92 : undefined),
      );
      if (!blob) throw new Error("no blob");
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const base = (file?.name ?? "image").replace(/\.[^.]+$/, "") || "image";
      onCropped(new File([blob], `${base}-cropped.${ext}`, { type }));
    } catch {
      setError("Could not crop that image. Try again.");
      setBusy(false);
    }
  }

  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 text-white/90 transition hover:bg-white/10";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      onClick={onCancel}
    >
      <div
        className={`flex w-full max-w-2xl flex-col overflow-hidden rounded-card bg-[#0f1115] shadow-lift ${round ? "gc-crop-round" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-white">{title}</p>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-lg leading-none text-white/70 hover:text-white">
            ✕
          </button>
        </div>

        <div className="relative bg-black" style={{ height: "min(70vh, 520px)" }}>
          {/* Cropper replaces this <img> with its own UI. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={src} alt="" className="block max-w-full" style={{ maxHeight: "100%" }} />
          {!ready ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
              Preparing your image…
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
          <button type="button" onClick={() => cropperRef.current?.zoom(-0.1)} className={iconBtn} aria-label="Zoom out" title="Zoom out">
            −
          </button>
          <button type="button" onClick={() => cropperRef.current?.zoom(0.1)} className={iconBtn} aria-label="Zoom in" title="Zoom in">
            +
          </button>
          <button type="button" onClick={() => cropperRef.current?.rotate(-90)} className={iconBtn} aria-label="Rotate left" title="Rotate left">
            ⟲
          </button>
          <button type="button" onClick={() => cropperRef.current?.rotate(90)} className={iconBtn} aria-label="Rotate right" title="Rotate right">
            ⟳
          </button>
          <button
            type="button"
            onClick={() => cropperRef.current?.reset()}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/10"
          >
            Reset
          </button>

          <div className="ml-auto flex items-center gap-2">
            {error ? <span className="text-xs font-medium text-red-400">{error}</span> : null}
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !ready}
              onClick={select}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? "Please wait…" : "Select"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
