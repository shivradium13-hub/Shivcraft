"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { Suggestion } from "@/app/api/search/suggest/route";

const RECENT_KEY = "giftcraft:recent-searches";
const POPULAR = [
  "photo mug",
  "name plate",
  "couple frame",
  "birthday gift",
  "magic mug",
  "wedding gift",
];

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string) {
  try {
    const next = [term, ...readRecent().filter((t) => t !== term)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode or blocked storage — recents are a convenience, not state */
  }
}

export function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  /* Debounced so a fast typist fires one request, not one per keystroke. */
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        setSuggestions(json?.data?.suggestions ?? []);
      } catch {
        /* aborted or offline — leave the previous list rather than flashing empty */
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const go = useCallback(
    (href: string, remember?: string) => {
      if (remember) {
        pushRecent(remember);
        setRecent(readRecent());
      }
      setOpen(false);
      setActive(-1);
      router.push(href);
    },
    [router],
  );

  const submit = useCallback(() => {
    const q = term.trim();
    if (!q) return;
    go(`/search?q=${encodeURIComponent(q)}`, q);
  }, [go, term]);

  const showQuick = term.trim().length < 2;
  const rows: { label: string; href: string; hint?: string; remember: string }[] = showQuick
    ? [...recent, ...POPULAR.filter((p) => !recent.includes(p))]
        .slice(0, 8)
        .map((t) => ({ label: t, href: `/search?q=${encodeURIComponent(t)}`, remember: t }))
    : suggestions.map((s) => ({
        label: s.label,
        href: s.href,
        hint: s.hint,
        remember: s.label,
      }));

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && active >= 0 && rows[active]) go(rows[active].href, rows[active].remember);
      else submit();
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-full border border-field bg-field-bg pr-1.5 pl-3.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" aria-hidden="true">
          <path
            d="M9 3.5a5.5 5.5 0 104 9.3l3.3 3.3 1.2-1.2-3.3-3.3A5.5 5.5 0 009 3.5zm0 1.6a3.9 3.9 0 110 7.8 3.9 3.9 0 010-7.8z"
            fill="currentColor"
          />
        </svg>
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search for gifts"
          placeholder="Search photo frames, name plates, mugs…"
          className="h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
        <button
          type="button"
          onClick={submit}
          className="h-8 shrink-0 rounded-full bg-brand-600 px-4 text-xs font-semibold text-white transition hover:bg-brand-700"
        >
          Search
        </button>
      </div>

      {open && rows.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-card border border-line bg-paper shadow-lift"
        >
          <p className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            {showQuick ? (recent.length ? "Recent & popular" : "Popular searches") : "Suggestions"}
            {loading ? <span className="ml-2 font-normal normal-case">searching…</span> : null}
          </p>
          <ul className="max-h-80 overflow-y-auto py-1">
            {rows.map((row, i) => (
              <li key={`${row.href}-${i}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(row.href, row.remember)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                    i === active ? "bg-brand-50 text-brand-800" : "text-ink"
                  }`}
                >
                  <span className="truncate">{row.label}</span>
                  {row.hint ? (
                    <span className="shrink-0 text-[11px] text-muted">{row.hint}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
