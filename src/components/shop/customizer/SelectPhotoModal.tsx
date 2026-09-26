"use client";

import { useEffect, useRef, useState } from "react";

type RecentItem = { id: string; url: string };

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;

const SOURCE_CLS =
  "flex w-full items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-left transition hover:border-brand-300";
const SOURCE_ICON = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-lg";

/**
 * The "Select Photo" source sheet (mockup screen 2): take a photo, choose from
 * the gallery, browse files, or reuse a recent upload. A recent photo is reused
 * by its id — it is not uploaded again. New files are validated here for a
 * friendly message; the server checks the real bytes regardless.
 */
export function SelectPhotoModal({
  onCancel,
  onPickFile,
  onPickRecent,
}: {
  onCancel: () => void;
  onPickFile: (file: File) => void;
  onPickRecent: (id: string, url: string) => void;
}) {
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/uploads")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j?.data?.items) setRecent(j.data.items);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function handle(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Use a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.`);
      return;
    }
    onPickFile(file);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select photo"
      className="fixed inset-0 z-[65] flex items-end justify-center bg-ink/60 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-canvas p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold text-ink">Select Photo</p>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-lg text-muted">
            ✕
          </button>
        </div>

        <div className="grid gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} className={SOURCE_CLS}>
            <span className={SOURCE_ICON} aria-hidden="true">📷</span>
            <span className="text-sm font-semibold text-ink">Take Photo</span>
          </button>
          <button type="button" onClick={() => galleryRef.current?.click()} className={SOURCE_CLS}>
            <span className={SOURCE_ICON} aria-hidden="true">🖼️</span>
            <span className="text-sm font-semibold text-ink">Choose from Gallery</span>
          </button>
          <button type="button" onClick={() => filesRef.current?.click()} className={SOURCE_CLS}>
            <span className={SOURCE_ICON} aria-hidden="true">📁</span>
            <span className="text-sm font-semibold text-ink">Browse Files</span>
          </button>
        </div>

        <p className="mt-3 text-xs font-semibold text-ink">Supported formats</p>
        <p className="text-xs text-muted">JPG, PNG, WebP (Max 20 MB)</p>
        {error ? <p className="mt-1 text-xs font-medium text-danger">{error}</p> : null}

        {recent.length > 0 ? (
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-semibold text-ink">Recent</p>
            <div className="grid grid-cols-4 gap-2">
              {recent.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPickRecent(item.id, item.url)}
                  className="relative aspect-square overflow-hidden rounded-lg border border-line bg-brand-50 transition hover:border-brand-400"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Hidden inputs. Camera capture opens the camera on a phone. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => handle(e.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => handle(e.target.files?.[0])}
        />
        <input
          ref={filesRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => handle(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
