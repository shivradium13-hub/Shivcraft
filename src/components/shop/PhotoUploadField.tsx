"use client";

import { useRef, useState } from "react";

type Uploaded = { id: string; url: string; name: string };

type Status =
  | { phase: "idle" }
  | { phase: "uploading"; name: string }
  | { phase: "error"; message: string };

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export function PhotoUploadField({
  label,
  helpText,
  required,
  value,
  onChange,
  error,
}: {
  label: string;
  helpText?: string | null;
  required?: boolean;
  value: Uploaded | null;
  onChange: (next: Uploaded | null) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [dragging, setDragging] = useState(false);
  /** The chosen photo, shown in a confirm pop-up so the customer can see exactly
   *  which image they are about to upload before it is sent. */
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  /** Validate, then show the chosen photo in a confirm pop-up. The upload happens
   *  as-is on confirm — no crop — so the original image (its own size and aspect
   *  ratio) is what the workshop receives. */
  function pick(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      setStatus({ phase: "error", message: "Use a JPG, PNG or WebP image." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({
        phase: "error",
        message: `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.`,
      });
      return;
    }
    setStatus({ phase: "idle" });
    setPreview({ file, url: URL.createObjectURL(file) });
  }

  function confirmUpload() {
    if (!preview) return;
    const file = preview.file;
    URL.revokeObjectURL(preview.url);
    setPreview(null);
    void send(file);
  }

  function cancelPreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function send(file: File) {
    setStatus({ phase: "uploading", name: file.name });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const json = await res.json();

      if (!res.ok) {
        setStatus({
          phase: "error",
          message: json?.error?.message ?? "That upload did not go through. Try again.",
        });
        return;
      }
      onChange({ id: json.data.id, url: json.data.url, name: file.name });
      setStatus({ phase: "idle" });
    } catch {
      setStatus({ phase: "error", message: "Upload failed — check your connection and try again." });
    }
  }

  async function remove() {
    const current = value;
    onChange(null);
    setStatus({ phase: "idle" });
    if (inputRef.current) inputRef.current.value = "";
    // Best effort: reclaim the blob straight away. If this request fails the
    // row is left with attached_at NULL — uploads_sweep_idx exists for a
    // cleanup job, but that job is NOT written yet.
    if (current) await fetch(`/api/uploads/${current.id}`, { method: "DELETE" }).catch(() => {});
  }

  const busy = status.phase === "uploading";

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold tracking-wide text-ink">
        {label}
        {required ? <span className="ml-1 text-danger">*</span> : null}
      </label>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-paper p-2.5">
          {/* The blob store is private; this URL is our authenticated proxy. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.url}
            alt="Your uploaded photo"
            className="h-16 w-16 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{value.name}</p>
            <p className="text-xs text-success">Uploaded</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:border-brand-400 hover:text-brand-700"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={remove}
              className="rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:border-danger hover:text-danger"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) pick(file);
          }}
          className={`rounded-lg border border-dashed p-4 text-center transition ${
            dragging ? "border-brand-500 bg-brand-50" : "border-field bg-field-bg"
          }`}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Uploading…" : "Upload Image"}
          </button>
          <p className="mt-2 text-xs text-muted">
            {busy ? status.name : "or drag a photo here · JPG, PNG, WebP up to 20 MB"}
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear it so picking the same file again still fires a change.
          e.target.value = "";
          if (file) pick(file);
        }}
      />

      {preview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm your photo"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={cancelPreview}
        >
          <div
            className="w-full max-w-md rounded-card bg-paper p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-ink">Use this photo?</p>
            <p className="mb-3 truncate text-xs text-muted">{preview.file.name}</p>
            <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-lg border border-line bg-field-bg">
              {/* A local preview of the customer's own file, shown before upload
                  so they can confirm it is the right photo. Uploaded as-is. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt="Selected photo"
                className="max-h-[60vh] w-auto max-w-full object-contain"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={cancelPreview}
                className="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-brand-400"
              >
                Choose another
              </button>
              <button
                type="button"
                onClick={confirmUpload}
                className="flex-1 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Upload this photo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {helpText ? <p className="mt-1.5 text-xs text-muted">{helpText}</p> : null}
      {status.phase === "error" ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{status.message}</p>
      ) : null}
      {error ? <p className="mt-1.5 text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
