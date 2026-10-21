import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, Link2, MapPin, Search, Star, TrendingUp } from "lucide-react";
import { AgentClosing, AgentPage, Card, Crumb, Ctas, Eyebrow, H2, Lead, Pic, Pill, Wrap } from "@/components/site/agents/agent-kit";
import { FaqAccordion } from "@/components/site/faq-accordion";

export const metadata: Metadata = {
  title: "AI SEO Agent — Get Found in Local Search | Noxtill",
  description: "Noxtill's AI SEO Agent audits your website, tracks the searches that matter, keeps your listings consistent and suggests page improvements you approve before they go live.",
  alternates: { canonical: "https://noxtill.com/agents/seo-agent" },
};

const RANKS = [14, 13, 11, 12, 9, 8, 7, 5];

const FAQS = [
  { question: "What does the SEO Agent check?", answer: "It crawls your site on a schedule for broken links, missing titles and descriptions, slow pages and redirect chains, and lists each issue with the page it affects." },
  { question: "Does it change my website on its own?", answer: "No. It suggests changes — new sections, internal links, better titles — and you review every one before it’s published." },
  { question: "How does it help with Google Maps?", answer: "It keeps your name, address, phone and hours consistent across your listings and flags the ones that are out of date." },
  { question: "Can it guarantee a ranking?", answer: "No one can. The agent tracks your real positions over time so you can see what changed and why." },
];

export default function Page() {
  return (
    <AgentPage>
      {/* Hero: search results mock */}
      <section className="bg-surface-tint">
        <Wrap className="grid items-center gap-12 py-14 lg:grid-cols-[0.95fr_1.05fr] lg:py-20">
          <div>
            <Crumb name="AI SEO Agent" />
            <Eyebrow>AI SEO Agent</Eyebrow>
            <h1 className="font-display text-[40px] font-bold leading-[1.04] tracking-tight sm:text-[56px]">
              Be the business <span className="text-primary">people find first.</span>
            </h1>
            <Lead className="max-w-[520px]">The SEO Agent audits your site, watches the searches your customers use, keeps your listings right and tells you exactly what to improve next.</Lead>
            <Ctas primary="Run my first audit" />
          </div>
          <Card className="p-0">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <Search className="h-4 w-4 text-fg-faint" aria-hidden />
              <span className="text-[14px] text-fg">roof repair near me</span>
            </div>
            <div className="p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-faint">Map results</p>
              {[
                { n: "Ironwood Roofing", r: "4.9", c: "212", you: true },
                { n: "Lubbock Roof Co.", r: "4.6", c: "98" },
                { n: "Plains Exteriors", r: "4.4", c: "61" },
              ].map((x, i) => (
                <div key={x.n} className={`mt-3 flex items-center gap-3 rounded-xl border p-3 ${x.you ? "border-primary bg-surface-tint" : "border-border"}`}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold">{x.n}</p>
                    <p className="flex items-center gap-1 text-[12px] text-fg-muted"><Star className="h-3 w-3 fill-[#e8a93c] text-[#e8a93c]" aria-hidden />{x.r} · {x.c} reviews · Open now</p>
                  </div>
                  {x.you && <Pill>Your business</Pill>}
                </div>
              ))}
            </div>
          </Card>
        </Wrap>
      </section>

      {/* Bento: picture + four jobs */}
      <section className="py-20">
        <Wrap>
          <Eyebrow>Four jobs, done every week</Eyebrow>
          <H2 className="max-w-[640px]">SEO that keeps working after you look away.</H2>
          <div className="mt-12 grid gap-4 lg:grid-cols-4 lg:grid-rows-2">
            <div className="lg:col-span-2 lg:row-span-2">
              <Pic src="/marketing/hb/slots/ai-card-seo-autopilot.jpeg" alt="SEO Autopilot with recommendations on a laptop" ratio="4 / 3" className="h-full" cover={false} />
            </div>
            {[
              { ic: AlertTriangle, h: "Site audits", d: "Broken links, missing titles, slow pages.", href: "/features/seo-audits" },
              { ic: TrendingUp, h: "Keyword tracking", d: "Your real positions, week by week.", href: "/features/keyword-tracking" },
              { ic: MapPin, h: "Local listings", d: "Same name, hours and phone everywhere.", href: "/features/local-seo" },
              { ic: FileText, h: "Content ideas", d: "What each page is missing.", href: "/features/content-optimization" },
            ].map(({ ic: Ic, h, d, href }) => (
              <Link key={h} href={href} className="group rounded-[22px] border border-border bg-surface p-6 transition hover:border-primary">
                <Ic className="h-6 w-6 text-primary" aria-hidden />
                <p className="mt-4 flex items-center gap-1 font-display text-[18px] font-semibold">{h}<ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" aria-hidden /></p>
                <p className="mt-1 text-[14px] text-fg-muted">{d}</p>
              </Link>
            ))}
          </div>
        </Wrap>
      </section>

      {/* Audit findings + rank chart */}
      <section className="bg-surface-tint py-20">
        <Wrap className="grid gap-6 lg:grid-cols-2">
          <Card className="p-0">
            <p className="flex items-center justify-between border-b border-border px-5 py-4 font-display text-[16px] font-semibold">Sunday’s audit <Pill tone="warn">3 to fix</Pill></p>
            {[
              { ic: Link2, h: "6 broken links", p: "/services/storm-damage", t: "warn" as const, tag: "Fix" },
              { ic: FileText, h: "Missing page title", p: "/roof-replacement", t: "warn" as const, tag: "Fix" },
              { ic: AlertTriangle, h: "Slow page (4.1 s)", p: "/gallery", t: "warn" as const, tag: "Fix" },
              { ic: CheckCircle2, h: "Redirects clean", p: "142 of 150 pages crawled", t: "good" as const, tag: "OK" },
            ].map(({ ic: Ic, h, p, t, tag }) => (
              <div key={h} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
                <Ic className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div className="flex-1"><p className="text-[14.5px] font-semibold">{h}</p><p className="font-mono text-[12px] text-fg-muted">{p}</p></div>
                <Pill tone={t}>{tag}</Pill>
              </div>
            ))}
          </Card>
          <Card>
            <p className="flex items-center justify-between font-display text-[16px] font-semibold">“roof repair lubbock” <Pill>Position 5</Pill></p>
            <svg viewBox="0 0 400 200" className="mt-6 h-auto w-full" role="img" aria-label="Ranking moving from position 14 to 5 over eight weeks">
              {[0, 1, 2, 3].map((g) => <line key={g} x1="0" x2="400" y1={20 + g * 50} y2={20 + g * 50} stroke="var(--border)" />)}
              <polyline fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round" points={RANKS.map((r, i) => `${20 + i * 51},${20 + ((r - 1) / 15) * 160}`).join(" ")} />
              {RANKS.map((r, i) => <circle key={i} cx={20 + i * 51} cy={20 + ((r - 1) / 15) * 160} r="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />)}
            </svg>
            <p className="mt-3 flex justify-between text-[12px] text-fg-faint"><span>8 weeks ago</span><span>This week</span></p>
          </Card>
        </Wrap>
      </section>

      {/* Listings table */}
      <section className="py-20">
        <Wrap className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Eyebrow>Local SEO</Eyebrow>
            <H2>Wrong hours online mean a locked door.</H2>
            <Lead>The agent compares your details across the places customers look and shows which ones need an update.</Lead>
          </div>
          <div className="overflow-x-auto rounded-[18px] border border-border bg-surface">
            <table className="w-full min-w-[520px] text-left text-[14px]">
              <thead className="bg-surface-tint text-[12px] uppercase tracking-wider text-fg-muted"><tr>{["Listing", "Hours", "Phone", "Status"].map((h) => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {[["Google Business Profile", "Matches", "Matches", ["Up to date", "good"]], ["Apple Business Connect", "Sunday differs", "Matches", ["Needs update", "warn"]], ["Bing Places", "Matches", "Matches", ["Up to date", "good"]], ["Yelp", "Sunday differs", "Old number", ["Needs update", "warn"]]].map((r) => (
                  <tr key={r[0] as string} className="border-t border-border">
                    <td className="px-5 py-3.5 font-semibold">{r[0] as string}</td>
                    <td className="px-5 py-3.5 text-fg-muted">{r[1] as string}</td>
                    <td className="px-5 py-3.5 text-fg-muted">{r[2] as string}</td>
                    <td className="px-5 py-3.5"><Pill tone={(r[3] as string[])[1] as "good" | "warn"}>{(r[3] as string[])[0]}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Wrap>
      </section>

      {/* Content suggestion */}
      <section className="bg-surface-deep py-20">
        <Wrap className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow onDeep>Content suggestions</Eyebrow>
            <H2 onDeep>Better pages, approved by you.</H2>
            <Lead onDeep>The agent compares each page with what searchers ask and suggests what to add. Nothing is published until you say so.</Lead>
          </div>
          <Card>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-fg-faint">Suggestion for /services/pool-repair</p>
            <p className="mt-3 rounded-xl border-l-4 border-primary bg-surface-tint px-4 py-3 text-[14.5px]">Add a short section: <b>“How much does pool leak repair cost?”</b> — this is the most-asked question for this page.</p>
            <p className="mt-3 rounded-xl border-l-4 border-[#1d5fa8] bg-[#e6f0fb] px-4 py-3 text-[14.5px]">Link to <b>/services/leak-detection</b> — visitors often look for it next.</p>
            <div className="mt-4 flex justify-end gap-2"><span className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold">Dismiss</span><span className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground">Approve</span></div>
          </Card>
        </Wrap>
      </section>

      <section className="py-20">
        <Wrap className="max-w-[860px]">
          <Eyebrow>FAQ</Eyebrow>
          <H2>SEO Agent questions.</H2>
          <div className="mt-8"><FaqAccordion items={FAQS} /></div>
        </Wrap>
      </section>

      <AgentClosing current="seo-agent" title="Get found by the customers already searching." sub="Start a 14-day free trial or book a demo to run your first site audit." />
    </AgentPage>
  );
}
