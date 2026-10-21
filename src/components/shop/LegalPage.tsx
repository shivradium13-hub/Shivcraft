import Link from "next/link";
import type { ReactNode } from "react";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

/** Shared, accessible styling for the public legal pages. No login or client JS. */
export function LegalPage({
  title,
  introduction,
  sections,
  lastUpdated = "21 October 2026",
}: {
  title: string;
  introduction: string;
  sections: readonly LegalSection[];
  lastUpdated?: string;
}) {
  return (
    <article className="mx-auto max-w-4xl pb-10">
      <div className="rounded-card border border-line bg-paper p-5 shadow-card sm:p-8">
        <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
          ← Back to Shiv Radium
        </Link>
        <h1 className="mt-5 font-display text-3xl font-semibold text-ink sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-ink-soft">{introduction}</p>
        <p className="mt-3 text-xs text-muted">Last updated: {lastUpdated}</p>

        <nav aria-label="On this page" className="mt-7 rounded-card border border-line bg-soft p-4">
          <h2 className="text-sm font-semibold text-ink">On this page</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id} className="text-sm">
                <a href={"#" + section.id} className="text-brand-700 hover:underline">
                  {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={section.id + "-heading"} className="scroll-mt-24">
              <h2 id={section.id + "-heading"} className="font-display text-xl font-semibold text-ink">
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-ink-soft sm:text-base">
                {section.content}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
