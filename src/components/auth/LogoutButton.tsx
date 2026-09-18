"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Clears the session row as well as the cookie, so the token cannot be
        // replayed even if it was captured.
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        router.replace("/login");
        router.refresh();
      }}
      className="rounded-full border border-sr-600 px-3 py-1.5 text-xs font-semibold text-sr-100 transition hover:border-sr-400 hover:text-white disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
