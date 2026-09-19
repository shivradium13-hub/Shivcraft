"use client";

import { useState } from "react";

type Result =
  | { ok: true; estimate: string; region: string; codAvailable: boolean; note: string }
  | { ok: false; message: string };

export function PincodeCheck() {
  const [pincode, setPincode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/delivery/check?pincode=${encodeURIComponent(pincode)}`);
      const json = await res.json();

      if (!res.ok) {
        setResult({ ok: false, message: json?.error?.message ?? "Could not check that PIN code." });
      } else if (!json.data.serviceable) {
        setResult({ ok: false, message: json.data.message });
      } else {
        setResult({
          ok: true,
          estimate: json.data.estimate,
          region: json.data.region,
          codAvailable: json.data.codAvailable,
          note: json.data.note,
        });
      }
    } catch {
      setResult({ ok: false, message: "Network problem — try again in a moment." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-paper p-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-ink">Check delivery</p>
      <div className="flex gap-2">
        <input
          value={pincode}
          inputMode="numeric"
          maxLength={6}
          aria-label="Delivery PIN code"
          placeholder="Enter 6-digit PIN code"
          onChange={(e) => {
            setPincode(e.target.value.replace(/\D/g, ""));
            setResult(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && pincode.length === 6 && void check()}
          className="min-w-0 flex-1 rounded-lg border border-field bg-paper px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button
          type="button"
          disabled={pincode.length !== 6 || busy}
          onClick={check}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-45"
        >
          {busy ? "Checking…" : "Check"}
        </button>
      </div>

      {result ? (
        result.ok ? (
          <div className="mt-3 rounded-lg bg-success-soft px-3 py-2.5">
            <p className="text-sm font-semibold text-success">Delivers in {result.estimate}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {result.region} · {result.codAvailable ? "Cash on delivery available" : "Prepaid only"}
            </p>
            <p className="mt-1 text-xs text-muted">{result.note}</p>
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {result.message}
          </p>
        )
      ) : null}
    </div>
  );
}
