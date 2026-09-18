"use client";

import { useRef, useState } from "react";

type Uploaded = { id: string; url: string; name: string };

type Status =
  | { phase: "idle" }
  | { phase: "uploading"; name: string }
  | { phase: "error"; message: string };

const MAX_BYTES = 8 * 1024 * 1024;
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

  async function send(file: File) {
    // Check what we can before spending the upload; the server checks the
    // real magic bytes regardless, since this side is easy to bypass.
    if (!ACCEPTED.includes(file.type)) {
      setStatus({ phase: "error", message: "Use a JPG, PNG or WebP image." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({
        phase: "error",
        message: `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.`,
      });
      return;
    }

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
            if (file) void send(file);
          }}
          className={`rounded-lg border border-dashed p-4 text-center transition ${
            dragging ? "border-brand-500 bg-brand-50" : "border-line-strong bg-paper"
          }`}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? "Uploading…" : "Upload Image"}
          </button>
          <p className="mt-2 text-xs text-muted">
            {busy ? status.name : "or drag a photo here · JPG, PNG, WebP up to 8 MB"}
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
          if (file) void send(file);
        }}
      />

      {helpText ? <p className="mt-1.5 text-xs text-muted">{helpText}</p> : null}
      {status.phase === "error" ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{status.message}</p>
      ) : null}
      {error ? <p className="mt-1.5 text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
