import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

/**
 * Shared shell for the 4 legal/policy pages (/privacy, /terms, /cookie-policy,
 * /refund-policy). Each page passes its content — built from `<LegalBlocks />`
 * rendering that page's block-array content module — as children.
 */
export function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg" data-theme="light">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-[760px] px-5 py-14 sm:px-7 sm:py-20">
          <Link href="/resources" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Resources
          </Link>

          <h1 className="mt-6 text-balance font-display text-4xl font-bold leading-tight text-fg sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-fg-faint">Last updated {lastUpdated}</p>

          <div className="mt-10">{children}</div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export type LegalBlock =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "callout"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] };

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Splits on **bold** markers (mirroring the source docx's <strong> runs) and renders them as <strong>. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** Renders a policy document's block array, preserving the source's heading/list/table structure. */
export function LegalBlocks({ blocks }: { blocks: LegalBlock[] }) {
  const h2s = blocks.filter((b): b is Extract<LegalBlock, { kind: "h2" }> => b.kind === "h2");

  return (
    <div className="flex flex-col gap-5 text-[15px] leading-relaxed text-fg-muted">
      {h2s.length > 8 ? (
        <nav aria-label="Table of contents" className="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5">
          <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent">Contents</p>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {h2s.map((h) => (
              <li key={h.text}>
                <a href={`#${slugify(h.text)}`} className="text-fg-muted hover:text-primary">
                  {h.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {blocks.map((block, i) => {
        switch (block.kind) {
          case "h2":
            return (
              <h2
                key={i}
                id={slugify(block.text)}
                className="mt-6 scroll-mt-24 font-display text-xl font-semibold text-fg sm:text-2xl"
              >
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-2 font-display text-base font-semibold text-fg">
                {block.text}
              </h3>
            );
          case "p":
            return (
              <p key={i}>{renderInline(block.text)}</p>
            );
          case "callout":
            return (
              <p key={i} className="rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5 text-fg">
                {renderInline(block.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="flex flex-col gap-2 ps-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span>{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-2">
                      {block.headers.map((h, j) => (
                        <th key={j} className="border-b border-border px-4 py-2.5 text-start font-semibold text-fg">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-b border-border last:border-b-0">
                        {row.map((cell, c) => (
                          <td key={c} className="px-4 py-2.5 align-top text-fg-muted">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
