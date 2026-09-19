"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export type AdminCategory = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
  showOnHome: boolean;
  directProducts: number;
  childCount: number;
};

export type AdminCategoryNode = AdminCategory & { children: AdminCategory[] };

const input =
  "w-full rounded-lg border border-field bg-sr-surface px-3 py-2 text-sm text-sr-ink outline-none focus:border-sr-400";

export function CategoryManager({ tree }: { tree: AdminCategoryNode[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [addingUnder, setAddingUnder] = useState<string | null | "TOP">(null);

  async function call(url: string, init: RequestInit, key: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, init);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "That did not work.");
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

  const patch = (id: string, body: Record<string, unknown>) =>
    call(`/api/admin/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }, id);

  async function remove(category: AdminCategory) {
    if (!window.confirm(`Delete "${category.name}"? This cannot be undone.`)) return;
    const result = await call(`/api/admin/categories/${category.id}`, { method: "DELETE" }, category.id);
    if (result) setNotice(`Deleted "${result.name}".`);
  }

  /** Reorders within one level and sends the whole level's new order. */
  async function move(siblings: AdminCategory[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;

    const order = siblings.map((c) => c.id);
    [order[index], order[target]] = [order[target], order[index]];

    await call("/api/admin/categories/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order }),
    }, siblings[index].id);
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}

      <div className="space-y-3">
        {tree.map((top, topIndex) => (
          <section key={top.id} className="rounded-2xl border border-sr-line bg-sr-surface">
            <CategoryRow
              category={top}
              isTop
              busy={busy === top.id}
              editing={editing === top.id}
              onEdit={() => setEditing(editing === top.id ? null : top.id)}
              onPatch={(body) => patch(top.id, body)}
              onDelete={() => remove(top)}
              onUp={() => move(tree, topIndex, -1)}
              onDown={() => move(tree, topIndex, 1)}
              canUp={topIndex > 0}
              canDown={topIndex < tree.length - 1}
            />

            <div className="border-t border-sr-line px-4 py-3">
              {top.children.length > 0 ? (
                <ul className="space-y-1.5">
                  {top.children.map((child, childIndex) => (
                    <li key={child.id} className="rounded-xl border border-sr-line bg-sr-canvas">
                      <CategoryRow
                        category={child}
                        busy={busy === child.id}
                        editing={editing === child.id}
                        onEdit={() => setEditing(editing === child.id ? null : child.id)}
                        onPatch={(body) => patch(child.id, body)}
                        onDelete={() => remove(child)}
                        onUp={() => move(top.children, childIndex, -1)}
                        onDown={() => move(top.children, childIndex, 1)}
                        canUp={childIndex > 0}
                        canDown={childIndex < top.children.length - 1}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-sr-muted">No subcategories yet.</p>
              )}

              {addingUnder === top.id ? (
                <AddForm
                  parentId={top.id}
                  onDone={() => setAddingUnder(null)}
                  onError={setError}
                  onSaved={(name) => setNotice(`Added "${name}".`)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingUnder(top.id)}
                  className="mt-2 text-xs font-semibold text-sr-600 hover:underline"
                >
                  + Add subcategory
                </button>
              )}
            </div>
          </section>
        ))}
      </div>

      {addingUnder === "TOP" ? (
        <div className="mt-3 rounded-2xl border border-sr-line bg-sr-surface p-4">
          <AddForm
            parentId={null}
            onDone={() => setAddingUnder(null)}
            onError={setError}
            onSaved={(name) => setNotice(`Added "${name}".`)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingUnder("TOP")}
          className="mt-3 w-full rounded-2xl border border-dashed border-sr-line-strong px-4 py-3 text-sm font-semibold text-sr-body hover:border-sr-400 hover:text-sr-700"
        >
          + Add top-level category
        </button>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  isTop = false,
  busy,
  editing,
  onEdit,
  onPatch,
  onDelete,
  onUp,
  onDown,
  canUp,
  canDown,
}: {
  category: AdminCategory;
  isTop?: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon ?? "");
  const [imageUrl, setImageUrl] = useState(category.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body });
      const json = await res.json();
      if (res.ok) setImageUrl(json.data.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={busy ? "opacity-60" : ""}>
      <div className={`flex flex-wrap items-center gap-2 ${isTop ? "p-4" : "p-2.5"}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sr-50 text-base">
          {category.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={category.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            (category.icon ?? "🎁")
          )}
        </span>

        {/* On a phone the name takes the whole row and the buttons wrap below,
            rather than squeezing the name down to an ellipsis. */}
        <div className="min-w-0 flex-1 basis-[60%] sm:basis-auto">
          <p className={`truncate ${isTop ? "font-semibold" : "text-sm"} text-sr-ink`}>
            {category.name}
            {!category.isActive ? (
              <span className="ml-2 rounded bg-sr-canvas px-1.5 py-0.5 text-[10px] font-semibold text-sr-muted">
                HIDDEN
              </span>
            ) : null}
            {category.showOnHome ? (
              <span className="ml-1.5 rounded bg-sr-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-sr-gold">
                HOME
              </span>
            ) : null}
          </p>
          <p className="truncate text-[11px] text-sr-muted">
            /{category.slug}
            {category.directProducts > 0
              ? ` · ${category.directProducts} product${category.directProducts === 1 ? "" : "s"}`
              : ""}
            {category.childCount > 0
              ? ` · ${category.childCount} subcategor${category.childCount === 1 ? "y" : "ies"}`
              : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1 max-sm:ml-auto max-sm:basis-full max-sm:justify-end">
          <IconButton label="Move up" disabled={!canUp} onClick={onUp}>↑</IconButton>
          <IconButton label="Move down" disabled={!canDown} onClick={onDown}>↓</IconButton>
          <button
            type="button"
            onClick={() => onPatch({ isActive: !category.isActive })}
            className="rounded-lg border border-sr-line-strong px-2.5 py-1 text-xs font-semibold text-sr-body hover:border-sr-400"
          >
            {category.isActive ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-sr-line-strong px-2.5 py-1 text-xs font-semibold text-sr-body hover:border-sr-400 hover:text-sr-700"
          >
            {editing ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="grid gap-3 border-t border-sr-line px-4 py-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-sr-ink">Name</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-sr-ink">Icon (emoji)</span>
            <input className={input} maxLength={8} value={icon} onChange={(e) => setIcon(e.target.value)} />
          </label>

          <div className="grid gap-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-sr-ink">Image</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-sr-line-strong px-3 py-1.5 text-xs font-semibold text-sr-body hover:border-sr-400 disabled:opacity-60"
              >
                {uploading ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
              </button>
              {imageUrl ? (
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="text-xs font-semibold text-danger hover:underline"
                >
                  Remove
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
              />
            </div>
          </div>

          {isTop ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={category.showOnHome}
                onChange={(e) => onPatch({ showOnHome: e.target.checked })}
                className="h-4 w-4 accent-sr-500"
              />
              Show as a card on the homepage
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => onPatch({ name, icon, imageUrl })}
              className="rounded-full bg-sr-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sr-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-soft"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddForm({
  parentId,
  onDone,
  onError,
  onSaved,
}: {
  parentId: string | null;
  onDone: () => void;
  onError: (message: string) => void;
  onSaved: (name: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId, icon }),
      });
      const json = await res.json();
      if (!res.ok) {
        onError(json?.error?.message ?? "Could not add that category.");
        return;
      }
      onSaved(json.data.category.name);
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <input
        autoFocus
        className={`${input} min-w-0 flex-1`}
        placeholder={parentId ? "Subcategory name" : "Category name"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      {!parentId ? (
        <input
          className="w-20 rounded-lg border border-field bg-sr-surface px-3 py-2 text-sm"
          placeholder="🎁"
          maxLength={8}
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
        />
      ) : null}
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={submit}
        className="rounded-lg bg-sr-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="rounded-lg border border-sr-line-strong px-3 py-2 text-sm font-semibold text-sr-body"
      >
        Cancel
      </button>
    </div>
  );
}

function IconButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-7 w-7 rounded-lg border border-sr-line-strong text-xs text-sr-body transition hover:border-sr-400 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
