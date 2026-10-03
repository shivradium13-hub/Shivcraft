"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export type AdminBannerView = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  posterUrl: string | null;
  posterW: number | null;
  posterH: number | null;
  href: string | null;
  ctaLabel: string | null;
  placement: string;
  position: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  live: boolean;
  onSite: boolean;
  expired: boolean;
  scheduled: boolean;
};

export type PlacementInfo = {
  value: string;
  label: string;
  shown: number;
  note: string;
};

const input =
  "w-full rounded-lg border border-field bg-field-bg px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";

type FormValues = {
  title: string;
  subtitle: string;
  imageUrl: string;
  posterUrl: string;
  posterW: number | null;
  posterH: number | null;
  href: string;
  ctaLabel: string;
  placement: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

/** Simplify a pixel size to a small "w:h" ratio, e.g. 1600×500 → "16:5". */
function ratioLabel(w: number | null, h: number | null): string | null {
  if (!w || !h) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h) || 1;
  return `${Math.round(w / d)}:${Math.round(h / d)}`;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function BannerManager({
  banners,
  placements,
}: {
  banners: AdminBannerView[];
  placements: PlacementInfo[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | "NEW" | null>(null);
  const [values, setValues] = useState<FormValues>(blank(placements[0]?.value ?? "HERO"));
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  function blank(placement: string): FormValues {
    return {
      title: "",
      subtitle: "",
      imageUrl: "",
      posterUrl: "",
      posterW: null,
      posterH: null,
      href: "",
      ctaLabel: "",
      placement,
      startsAt: "",
      endsAt: "",
      isActive: true,
    };
  }

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function call(url: string, init: RequestInit, key: string) {
    setBusy(key);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(url, init);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "That did not work.");
        setFieldErrors(json?.error?.fields ?? {});
        return null;
      }
      router.refresh();
      return json.data;
    } catch {
      setError("Network problem — try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "That image could not be uploaded.");
        return;
      }
      set("imageUrl", json.data.url);
    } catch {
      setError("The upload did not finish. Try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /** Reads an image URL's natural pixel size, so we can store and show its ratio. */
  function measure(url: string): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function uploadPoster(file: File) {
    setUploadingPoster(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "That poster could not be uploaded.");
        return;
      }
      const url = json.data.url as string;
      const size = await measure(url);
      setValues((prev) => ({
        ...prev,
        posterUrl: url,
        posterW: size?.w ?? null,
        posterH: size?.h ?? null,
      }));
    } catch {
      setError("The upload did not finish. Try again.");
    } finally {
      setUploadingPoster(false);
      if (posterRef.current) posterRef.current.value = "";
    }
  }

  async function save() {
    const usePoster = values.placement === "HERO";
    const body = {
      title: values.title,
      subtitle: values.subtitle,
      imageUrl: values.imageUrl,
      // The poster is a Hero-only feature; never carry one onto another placement.
      posterUrl: usePoster ? values.posterUrl : "",
      posterW: usePoster ? values.posterW : null,
      posterH: usePoster ? values.posterH : null,
      href: values.href,
      ctaLabel: values.ctaLabel,
      placement: values.placement,
      position: 0,
      startsAt: values.startsAt || null,
      endsAt: values.endsAt || null,
      isActive: values.isActive,
    };

    const result = await call(
      editing === "NEW" ? "/api/admin/banners" : `/api/admin/banners/${editing}`,
      {
        method: editing === "NEW" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      "save",
    );

    if (result) {
      setNotice(editing === "NEW" ? `Created “${result.banner.title}”.` : "Saved.");
      setEditing(null);
    }
  }

  async function remove(banner: AdminBannerView) {
    if (!window.confirm(`Delete “${banner.title}”? This cannot be undone.`)) return;
    const result = await call(`/api/admin/banners/${banner.id}`, { method: "DELETE" }, banner.id);
    if (result) setNotice(`Deleted “${result.title}”.`);
  }

  /** Sends the whole new order of one placement, so nothing can half-apply. */
  async function move(group: AdminBannerView[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= group.length) return;

    const reordered = [...group];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    await call(
      "/api/admin/banners",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: reordered.map((b) => b.id) }),
      },
      group[index].id,
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setValues(blank(placements[0]?.value ?? "HERO"));
            setEditing("NEW");
            setError(null);
            setFieldErrors({});
            setNotice(null);
          }}
          className="rounded-lg bg-sr-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sr-700"
        >
          New banner
        </button>
        {editing !== null ? (
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded-lg border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {notice ? (
        <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {editing !== null ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          className="mt-4 rounded-card border border-sr-line bg-sr-surface p-4 shadow-card"
        >
          <h2 className="font-display text-lg font-semibold text-sr-ink">
            {editing === "NEW" ? "New banner" : "Edit banner"}
          </h2>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Title" required error={fieldErrors.title}>
              <input
                className={input}
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Gifts they will actually keep"
              />
            </Field>

            <Field label="Subtitle" error={fieldErrors.subtitle}>
              <input
                className={input}
                value={values.subtitle}
                onChange={(e) => set("subtitle", e.target.value)}
              />
            </Field>

            <Field label="Where it goes" required error={fieldErrors.placement}>
              <select
                className={input}
                value={values.placement}
                onChange={(e) => set("placement", e.target.value)}
              >
                {placements.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Button label" hint="Defaults to “Shop Now”." error={fieldErrors.ctaLabel}>
              <input
                className={input}
                value={values.ctaLabel}
                onChange={(e) => set("ctaLabel", e.target.value)}
              />
            </Field>

            <Field
              label="Link"
              hint="A path inside the shop, like /category/name-plates."
              error={fieldErrors.href}
            >
              <input
                className={input}
                value={values.href}
                onChange={(e) => set("href", e.target.value)}
                placeholder="/category/name-plates"
              />
            </Field>

            <Field
              label="Image"
              hint="The small picture beside the title in the designed banner."
              error={fieldErrors.imageUrl}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                  className="text-xs text-sr-body"
                />
                {uploading ? <span className="text-xs text-sr-muted">Uploading…</span> : null}
              </div>
            </Field>
          </div>

          {values.imageUrl ? (
            <div className="mt-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={values.imageUrl}
                alt=""
                className="h-20 w-32 rounded-lg border border-sr-line object-cover"
              />
              <button
                type="button"
                onClick={() => set("imageUrl", "")}
                className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
              >
                Remove image
              </button>
            </div>
          ) : null}

          {/* Full poster — a finished image that replaces the whole hero. Hero
              only, so it never becomes a control that does nothing elsewhere. */}
          {values.placement === "HERO" ? (
            <div className="mt-4 rounded-lg border border-sr-line bg-sr-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-sr-ink">Full poster (replaces the hero)</span>
                {ratioLabel(values.posterW, values.posterH) ? (
                  <span className="rounded-full bg-sr-gold-soft px-2 py-0.5 text-[11px] font-semibold text-sr-gold">
                    {values.posterW}×{values.posterH}px · ratio {ratioLabel(values.posterW, values.posterH)}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-sr-muted">
                Upload one finished image and it fills the whole hero — the title, subtitle and button
                are not shown. It appears at its own ratio on phones and desktop; a wide landscape
                poster works best (around 1600×600px, roughly 8:3). The “Link” above still makes it
                clickable.
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={posterRef}
                  type="file"
                  accept="image/*"
                  disabled={uploadingPoster}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadPoster(file);
                  }}
                  className="text-xs text-sr-body"
                />
                {uploadingPoster ? <span className="text-xs text-sr-muted">Uploading…</span> : null}
              </div>

              {values.posterUrl ? (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={values.posterUrl}
                    alt=""
                    className="w-full max-w-md rounded-lg border border-sr-line object-contain"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setValues((prev) => ({ ...prev, posterUrl: "", posterW: null, posterH: null }))
                    }
                    className="mt-2 block rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body"
                  >
                    Remove poster
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Starts" hint="Leave empty to show immediately." error={fieldErrors.startsAt}>
              <input
                type="datetime-local"
                className={input}
                value={values.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
              />
            </Field>
            <Field label="Ends" hint="Leave empty to run indefinitely." error={fieldErrors.endsAt}>
              <input
                type="datetime-local"
                className={input}
                value={values.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
              />
            </Field>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-sr-body">
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            Active
          </label>

          <button
            type="submit"
            disabled={busy === "save"}
            className="mt-4 rounded-lg bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700 disabled:opacity-60"
          >
            {busy === "save" ? "Saving…" : editing === "NEW" ? "Create banner" : "Save changes"}
          </button>
        </form>
      ) : null}

      {placements.map((placement) => {
        const group = banners.filter((b) => b.placement === placement.value);

        return (
          <section key={placement.value} className="mt-8">
            <h2 className="font-display text-lg font-semibold text-sr-ink">{placement.label}</h2>
            <p className="mt-0.5 mb-3 text-sm text-sr-muted">{placement.note}</p>

            {group.length === 0 ? (
              <p className="rounded-card border border-dashed border-field bg-field-bg px-4 py-6 text-center text-sm text-sr-muted">
                Nothing here yet.
              </p>
            ) : (
              <ul className="grid gap-3">
                {group.map((banner, index) => (
                  <li
                    key={banner.id}
                    className="flex flex-wrap items-start gap-3 rounded-card border border-sr-line bg-sr-surface p-3 shadow-card"
                  >
                    {banner.posterUrl || banner.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={banner.posterUrl ?? banner.imageUrl ?? ""}
                        alt=""
                        className="h-16 w-24 shrink-0 rounded-lg border border-sr-line object-cover"
                      />
                    ) : (
                      <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-sr-line-strong text-[11px] text-sr-muted">
                        No image
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-sr-ink">{banner.title}</span>
                        <BannerBadge banner={banner} slots={placement.shown} />
                        {banner.posterUrl ? (
                          <span className="rounded-full bg-sr-gold-soft px-2 py-0.5 text-[11px] font-semibold text-sr-gold">
                            Poster
                            {ratioLabel(banner.posterW, banner.posterH)
                              ? ` · ${ratioLabel(banner.posterW, banner.posterH)}`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                      {banner.subtitle ? (
                        <p className="mt-0.5 text-sm text-sr-body">{banner.subtitle}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-sr-muted">
                        {banner.href ?? "No link"}
                        {banner.endsAt
                          ? ` · ends ${new Date(banner.endsAt).toLocaleDateString("en-IN")}`
                          : ""}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <SmallButton
                          disabled={index === 0 || busy === banner.id}
                          onClick={() => move(group, index, -1)}
                        >
                          ↑
                        </SmallButton>
                        <SmallButton
                          disabled={index === group.length - 1 || busy === banner.id}
                          onClick={() => move(group, index, 1)}
                        >
                          ↓
                        </SmallButton>
                        <SmallButton
                          onClick={() => {
                            setValues({
                              title: banner.title,
                              subtitle: banner.subtitle ?? "",
                              imageUrl: banner.imageUrl ?? "",
                              posterUrl: banner.posterUrl ?? "",
                              posterW: banner.posterW,
                              posterH: banner.posterH,
                              href: banner.href ?? "",
                              ctaLabel: banner.ctaLabel ?? "",
                              placement: banner.placement,
                              startsAt: toLocalInput(banner.startsAt),
                              endsAt: toLocalInput(banner.endsAt),
                              isActive: banner.isActive,
                            });
                            setEditing(banner.id);
                            setError(null);
                            setNotice(null);
                          }}
                        >
                          Edit
                        </SmallButton>
                        <SmallButton
                          disabled={busy === banner.id}
                          onClick={() =>
                            call(
                              `/api/admin/banners/${banner.id}`,
                              {
                                method: "PATCH",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  title: banner.title,
                                  subtitle: banner.subtitle ?? "",
                                  imageUrl: banner.imageUrl ?? "",
                                  posterUrl: banner.posterUrl ?? "",
                                  posterW: banner.posterW,
                                  posterH: banner.posterH,
                                  href: banner.href ?? "",
                                  ctaLabel: banner.ctaLabel ?? "",
                                  placement: banner.placement,
                                  position: banner.position,
                                  startsAt: banner.startsAt,
                                  endsAt: banner.endsAt,
                                  isActive: !banner.isActive,
                                }),
                              },
                              banner.id,
                            )
                          }
                        >
                          {banner.isActive ? "Switch off" : "Switch on"}
                        </SmallButton>
                        <SmallButton danger disabled={busy === banner.id} onClick={() => remove(banner)}>
                          Delete
                        </SmallButton>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function BannerBadge({ banner, slots }: { banner: AdminBannerView; slots: number }) {
  const [label, tone] = !banner.isActive
    ? ["Switched off", "bg-sr-canvas text-sr-muted"]
    : banner.expired
      ? ["Expired", "bg-danger-soft text-danger"]
      : banner.scheduled
        ? ["Scheduled", "bg-info-soft text-info"]
        : banner.onSite
          ? ["On the homepage", "bg-success-soft text-success"]
          : // Live, but past the cut — saying "active" here would be a lie.
            [`Queued — only ${slots} shown`, "bg-sr-gold-soft text-sr-gold"];

  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>;
}

function SmallButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
        danger
          ? "border-danger text-danger hover:bg-danger-soft"
          : "border-sr-line-strong text-sr-body hover:border-sr-400"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-sr-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-xs font-medium text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-sr-muted">{hint}</span>
      ) : null}
    </label>
  );
}
