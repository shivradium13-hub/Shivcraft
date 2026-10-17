"use client";

import { useState } from "react";

import { LoginForm } from "./LoginForm";
import { OtpLoginForm } from "./OtpLoginForm";

/**
 * Switches between password sign-in and WhatsApp OTP. When WhatsApp OTP is off
 * (admin setting), only the password form shows — identical to before — so the
 * safe password path is always available.
 */
export function LoginTabs({ next, whatsappEnabled }: { next?: string; whatsappEnabled: boolean }) {
  const [tab, setTab] = useState<"password" | "whatsapp">("password");

  if (!whatsappEnabled) return <LoginForm next={next} />;

  const btn = (active: boolean) =>
    `rounded-full px-3 py-2 text-sm font-semibold transition ${
      active ? "bg-sr-surface text-sr-ink shadow-sm" : "text-sr-body hover:text-sr-ink"
    }`;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-full border border-sr-line bg-sr-canvas p-1">
        <button type="button" onClick={() => setTab("password")} className={btn(tab === "password")}>
          Password
        </button>
        <button type="button" onClick={() => setTab("whatsapp")} className={btn(tab === "whatsapp")}>
          WhatsApp OTP
        </button>
      </div>
      {tab === "password" ? <LoginForm next={next} /> : <OtpLoginForm next={next} />}
    </div>
  );
}
