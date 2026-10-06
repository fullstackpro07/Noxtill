"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { s } from "./s";

interface SearchEntry {
  key: string;
  route: string;
  title: string;
  cat: string;
  updated: string;
  section: string;
  anchor: string;
  text: string;
}
interface SearchHit {
  score: number;
  title: string;
  section: string;
  excerpt: string;
  updated: string;
  route: string;
  cat: string;
  href: string;
}

const CATS = ["All", "Legal", "Privacy", "Security", "AI", "Messaging", "Billing", "Company"];

/** Public-only search over the published policy text (index loaded on first keystroke). */
function search(index: SearchEntry[], q: string, cat: string): SearchHit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const res: SearchHit[] = [];
  for (const e of index) {
    if (cat && cat !== "All" && e.cat !== cat) continue;
    const hay = `${e.title} ${e.section} ${e.text}`.toLowerCase();
    let score = 0;
    let miss = false;
    for (const t of terms) {
      if (hay.indexOf(t) < 0) {
        miss = true;
        break;
      }
      score += (e.section.toLowerCase().includes(t) ? 3 : 0) + (e.title.toLowerCase().includes(t) ? 2 : 0) + 1;
    }
    if (miss) continue;
    const first = e.text.toLowerCase().indexOf(terms[0]);
    const st = Math.max(0, first - 60);
    const excerpt = (st > 0 ? "…" : "") + e.text.slice(st, st + 190) + (e.text.length > st + 190 ? "…" : "");
    res.push({ score, title: e.title, section: e.section, excerpt, updated: e.updated, route: e.route, cat: e.cat, href: `${e.route}#${e.anchor}` });
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, 30);
}

function useSearch(q: string, cat: string) {
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const active = !!q.trim();
  useEffect(() => {
    if (!active || index) return;
    let cancelled = false;
    import("@/lib/marketing/legal/data/nox-search.json").then((m) => {
      if (!cancelled) setIndex(m.default as SearchEntry[]);
    });
    return () => {
      cancelled = true;
    };
  }, [active, index]);
  return { searching: active, results: active && index ? search(index, q, cat) : [], loading: active && !index };
}

/** Legal Center hero search (light). */
export function LegalCenterSearch() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const { searching, results, loading } = useSearch(q, cat);
  return (
    <>
      <div role="search" style={s("margin-top: 24px; display: flex; flex-direction: column; gap: 12px;")} data-noprint="true">
        <label htmlFor="lc-q" style={s("font-size: 14px; font-weight: 700;")}>
          Search policies
        </label>
        <input
          id="lc-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. refund, WhatsApp, subprocessors, training"
          aria-controls="lc-results"
          style={s("height: 54px; max-width: 720px; padding: 0 18px; border-radius: 14px; border: 1px solid #BFD3C8; font: 500 17px 'Plus Jakarta Sans', sans-serif; background: #FFFFFF;")}
        />
        <div role="group" aria-label="Category" style={s("display: flex; flex-wrap: wrap; gap: 6px;")}>
          {CATS.map((c) => {
            const on = cat === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => setCat(c)}
                style={s(
                  `height: 38px; padding: 0 14px; border-radius: 999px; border: 1px solid ${on ? "#064F3B" : "#CFDDD5"}; background: ${on ? "#064F3B" : "#FFFFFF"}; color: ${on ? "#FFFFFF" : "#24343C"}; font: 700 14px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`,
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>
      <div id="lc-results" aria-live="polite" style={s("margin-top: 14px;")} data-noprint="true">
        {searching ? (
          <>
            <p style={s("margin: 0 0 10px; font-size: 14px; color: #3A4A52;")}>{loading ? "Searching…" : results.length ? `${results.length} results` : "No matching public policy text."}</p>
            <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-width: 900px;")}>
              {results.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="h-bd"
                    style={s("display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 12px; background: #FFFFFF; border: 1px solid #D9E8E0; text-decoration: none; color: #0B1822;")}
                  >
                    <span style={s("display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline;")}>
                      <strong style={s("font-size: 16px; color: #064F3B;")}>{r.title}</strong>
                      <span style={s("font-size: 14px; font-weight: 600;")}>{r.section}</span>
                      <span style={s("font-size: 12px; color: #4C5B63;")}>
                        {r.route} · Updated {r.updated} · {r.cat}
                      </span>
                    </span>
                    <span style={s("font-size: 14px; line-height: 1.5; color: #3A4A52;")}>{r.excerpt}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </>
  );
}

/** Trust Center hero search (dark hero) + its results section below the hero. */
export function TrustCenterSearch({ hero }: { hero: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const { searching, results, loading } = useSearch(q, cat);
  return (
    <>
      <section
        aria-labelledby="tc-h1"
        style={s("position: relative; overflow: hidden; background: radial-gradient(110% 130% at 90% 10%, #0A6B4E 0%, #064F3B 40%, #043F31 100%); color: #FFFFFF;")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/legal/noxtill-logo.png"
          alt=""
          aria-hidden="true"
          style={s("position: absolute; right: -40px; top: 40px; width: 360px; height: 360px; border-radius: 80px; opacity: 0.14; pointer-events: none;")}
        />
        <div style={s("position: relative; max-width: 1240px; margin: 0 auto; padding: 28px 24px 56px;")}>
          {hero}
          <div role="search" style={s("margin-top: 26px; max-width: 760px; display: flex; flex-direction: column; gap: 10px;")}>
            <label htmlFor="tc-q" style={s("font-size: 14px; font-weight: 700;")}>
              Search policies and trust documents
            </label>
            <input
              id="tc-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. data retention, AI training, opt-out, DPA"
              aria-controls="tc-results"
              style={s("height: 56px; padding: 0 18px; border-radius: 14px; border: 0; font: 500 17px 'Plus Jakarta Sans', sans-serif; color: #0B1822;")}
            />
            <div role="group" aria-label="Category" style={s("display: flex; flex-wrap: wrap; gap: 6px;")} data-noprint="true">
              {CATS.map((c) => {
                const on = cat === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCat(c)}
                    style={s(
                      `height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid ${on ? "#44F0B0" : "rgba(255,255,255,0.4)"}; background: ${on ? "#44F0B0" : "transparent"}; color: ${on ? "#043F31" : "#FFFFFF"}; font: 700 13px 'Plus Jakarta Sans', sans-serif; cursor: pointer;`,
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      <section id="tc-results" aria-live="polite" style={s("max-width: 1240px; margin: 0 auto; padding: 0 24px;")}>
        {searching ? (
          <div style={s("padding: 24px 0 8px;")}>
            <h2 style={s("margin: 0 0 10px; font-size: 18px; font-weight: 800;")}>{loading ? "Searching…" : results.length ? `${results.length} results` : "No matching public content"}</h2>
            <ol style={s("list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px;")}>
              {results.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="h-bd"
                    style={s("display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 12px; border: 1px solid #D9E8E0; text-decoration: none; color: #0B1822;")}
                  >
                    <span style={s("display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline;")}>
                      <strong style={s("font-size: 16px; color: #064F3B;")}>{r.title}</strong>
                      <span style={s("font-size: 14px; font-weight: 600;")}>{r.section}</span>
                      <span style={s("font-size: 12px; color: #4C5B63;")}>
                        {r.route} · Updated {r.updated}
                      </span>
                    </span>
                    <span style={s("font-size: 14px; line-height: 1.5; color: #3A4A52;")}>{r.excerpt}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>
    </>
  );
}
