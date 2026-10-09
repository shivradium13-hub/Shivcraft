"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";

/* Shared, polished inputs for the auth screens: a labelled field with an
   optional leading icon, and a password field with a show/hide toggle. */

const base =
  "w-full rounded-xl border border-field bg-field-bg py-2.5 text-sm text-sr-ink outline-none transition placeholder:text-field-placeholder focus:border-sr-400 focus:bg-sr-surface focus:ring-2 focus:ring-sr-100";

function Leading({ children }: { children: ReactNode }) {
  return (
    <span
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sr-muted"
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
  error?: string;
  hint?: string;
};

export function AuthField({ label, icon, error, hint, id, className, ...props }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-sr-ink">
        {label}
      </label>
      <div className="relative">
        {icon ? <Leading>{icon}</Leading> : null}
        <input id={id} {...props} className={`${base} ${icon ? "pl-10" : "pl-3.5"} pr-3.5 ${className ?? ""}`} />
      </div>
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-sr-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function AuthPasswordField({ label, icon, error, hint, id, ...props }: FieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-sr-ink">
        {label}
      </label>
      <div className="relative">
        {icon ? <Leading>{icon}</Leading> : null}
        <input
          id={id}
          {...props}
          type={show ? "text" : "password"}
          className={`${base} ${icon ? "pl-10" : "pl-3.5"} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-sr-muted transition hover:text-sr-600"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-sr-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- icons */
const S = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const UserIcon = () => (
  <svg {...S}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);
export const AtIcon = () => (
  <svg {...S}><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9" /></svg>
);
export const MailIcon = () => (
  <svg {...S}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
export const PhoneIcon = () => (
  <svg {...S}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
);
export const LockIcon = () => (
  <svg {...S}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
const EyeIcon = () => (
  <svg {...S}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);
const EyeOffIcon = () => (
  <svg {...S}><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M6.6 6.6A18 18 0 0 0 2 11s3.5 7 10 7a10.9 10.9 0 0 0 4.1-.8" /><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" /><path d="m2 2 20 20" /></svg>
);
