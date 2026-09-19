"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isBlocked: boolean;
  orderCount: number;
};

/**
 * Block / unblock and promote / demote for one account.
 *
 * The server refuses self-lockout and removing the last admin, so this does
 * not try to guess those rules a second time — it shows whatever the server
 * says instead of hiding a button that might actually be allowed.
 */
export function UserControls({
  user,
  isSelf,
  compact = false,
}: {
  user: UserRow;
  isSelf: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "That did not work.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete ${user.name}'s account? This cannot be undone. Blocking keeps the record and stops them signing in.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "That did not work.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "" : "mt-3"}>
      <div className="flex flex-wrap gap-1.5">
        {isSelf ? (
          <span className="rounded-lg bg-sr-canvas px-3 py-1.5 text-xs font-semibold text-sr-muted">
            This is you
          </span>
        ) : (
          <>
            <Button
              busy={busy}
              onClick={() =>
                patch(
                  { isBlocked: !user.isBlocked },
                  user.isBlocked
                    ? undefined
                    : `Block ${user.name}? They are signed out at once and cannot sign in or order until you unblock them.`,
                )
              }
              tone={user.isBlocked ? "ok" : "warn"}
            >
              {user.isBlocked ? "Unblock" : "Block"}
            </Button>

            <Button
              busy={busy}
              onClick={() =>
                patch(
                  { role: user.role === "ADMIN" ? "USER" : "ADMIN" },
                  user.role === "ADMIN"
                    ? `Remove admin access from ${user.name}? They are signed out and lose the admin area.`
                    : `Make ${user.name} an admin? They will be able to see and change every order, product and account.`,
                )
              }
              tone="plain"
            >
              {user.role === "ADMIN" ? "Remove admin" : "Make admin"}
            </Button>

            <Button busy={busy} onClick={remove} tone="danger">
              Delete
            </Button>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Button({
  children,
  onClick,
  busy,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  tone: "ok" | "warn" | "danger" | "plain";
}) {
  const tones = {
    ok: "border-success text-success hover:bg-success-soft",
    warn: "border-warn text-warn hover:bg-sr-gold-soft",
    danger: "border-danger text-danger hover:bg-danger-soft",
    plain: "border-sr-line-strong text-sr-body hover:border-sr-400",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
