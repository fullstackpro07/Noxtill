"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Sparkles } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchProducts } from "@/lib/products-api";
import { websiteApi } from "@/lib/website-api";
import { Btn, Card, Field, Kpi, Notice, Page, errorText, inputClass, inputStyle } from "./website-ui";

const GOALS: Record<string, string> = { sell: "Sell products online", book: "Take bookings", lead: "Get enquiries (leads)", info: "Share information" };
const PAGE_LABELS: Record<string, string> = { home: "Home", about: "About us", products: "Shop", services: "Services", contact: "Contact", faq: "FAQ" };

export function WebsiteBuilderView() {
  useModuleHeader({ title: "AI Website Builder", subtitle: "Generate a draft site from your real business data" });
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["website", "builder"], queryFn: websiteApi.builder });
  const products = useQuery({ queryKey: ["products", "website-picker"], queryFn: () => fetchProducts({}) });
  const [goal, setGoal] = useState("sell");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("friendly");
  const [pages, setPages] = useState<string[]>(["home", "about", "products", "contact"]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [includeReviews, setIncludeReviews] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const generate = useMutation({
    mutationFn: () => websiteApi.generate({ goal, audience: audience || undefined, tone, pages, productIds: productIds.length ? productIds : undefined, includeReviews, useAi }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["website"] }),
  });
  const s = status.data;

  return (
    <Page>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Setup completion" value={s ? `${s.setupCompletion}%` : "…"} hint="Business data the builder can use" />
        <Kpi label="Generated drafts" value={s?.draftPagesGenerated ?? "…"} hint="Not yet edited" />
        <Kpi label="Missing business data" value={s?.missing.length ?? "…"} tone={s?.missing.length ? "warn" : "ok"} />
        <Kpi label="Pages in site" value={s?.totalPages ?? "…"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Build a draft site">
          <div className="flex flex-col gap-4">
            <Field label="Main goal">
              <div className="flex flex-wrap gap-2">
                {Object.entries(GOALS).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={goal === k} onClick={() => setGoal(k)} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: goal === k ? "var(--app-primary)" : "var(--app-border)", fontWeight: goal === k ? 700 : 400 }}>{label}</button>
                ))}
              </div>
            </Field>
            {goal === "book" && s && !s.bookingConfigured && <Notice tone="warn">Booking isn&rsquo;t set up yet. The Book button will link to your booking page once you configure it in Bookings.</Notice>}
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Who is the site for? (optional)"><input className={inputClass} style={inputStyle} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. busy parents nearby" maxLength={300} /></Field>
              <Field label="Tone"><select className={inputClass} style={inputStyle} value={tone} onChange={(e) => setTone(e.target.value)}>{(s?.options.tones ?? ["friendly"]).map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
            </div>
            <Field label="Pages to create">
              <div className="flex flex-wrap gap-2">
                {Object.entries(PAGE_LABELS).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs" style={{ borderColor: "var(--app-border)" }}>
                    <input type="checkbox" checked={pages.includes(k)} onChange={(e) => setPages(e.target.checked ? [...pages, k] : pages.filter((p) => p !== k))} /> {label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label={`Featured products (${productIds.length || "all"})`} hint="Leave empty to show all visible products. Products are linked, never copied.">
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
                {(products.data ?? []).map((p) => {
                  const on = productIds.includes(p.id);
                  return <button key={p.id} type="button" aria-pressed={on} onClick={() => setProductIds(on ? productIds.filter((x) => x !== p.id) : [...productIds, p.id])} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: on ? "var(--app-primary)" : "var(--app-border)", background: on ? "var(--app-primary)" : "transparent", color: on ? "var(--app-primary-foreground)" : "var(--app-text)" }}>{p.name}</button>;
                })}
                {products.data?.length === 0 && <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>No products yet.</span>}
              </div>
            </Field>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2"><input type="checkbox" checked={includeReviews} onChange={(e) => setIncludeReviews(e.target.checked)} /> Include real customer reviews</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Let AI write first-draft copy</label>
            </div>
            <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              AI only sees your business name, goal, audience, tone and how many products and services you have. It may not state prices, numbers or claims; text with invented numbers is thrown away. Without AI, pages get [bracketed placeholders] for you to fill in. Nothing is published automatically.
            </p>
            <Btn variant="primary" className="self-start" disabled={!pages.length || generate.isPending} onClick={() => generate.mutate()}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> {generate.isPending ? "Generating…" : "Generate draft"}
            </Btn>
            {generate.isError && <Notice tone="danger">{errorText(generate.error)}</Notice>}
            {generate.data && (
              <Notice tone={generate.data.ai.startsWith("failed") || generate.data.ai.startsWith("discarded") ? "warn" : "ok"}>
                Created {generate.data.pages.length} draft page{generate.data.pages.length === 1 ? "" : "s"}: {generate.data.pages.map((p) => p.title).join(", ")}.
                {generate.data.formCreated ? " A contact form linked to your CRM was created." : ""}
                {" "}AI copy: {generate.data.ai === "used" ? "used" : generate.data.ai === "not_requested" ? "not requested" : generate.data.ai}.
                {generate.data.pagesNeedingText.length ? ` Replace the [placeholders] on: ${generate.data.pagesNeedingText.join(", ")}.` : ""}{" "}
                <Link className="font-semibold underline" href="/website/pages">Review in Pages →</Link>
              </Notice>
            )}
          </div>
        </Card>

        <Card title="Business data the builder uses">
          {status.isError ? <Notice tone="danger">{errorText(status.error)}</Notice> : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
              {(s?.checklist ?? []).map((c) => (
                <li key={c.key} className="flex items-center gap-2">
                  {c.done ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--app-success-text)" }} aria-label="Done" /> : <Circle className="h-4 w-4" style={{ color: "var(--app-text-faint)" }} aria-label="Missing" />}
                  <span>{c.label}{typeof c.count === "number" ? ` (${c.count})` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 mt-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Missing items don&rsquo;t block generation; those sections get placeholders. Fill them in their own modules and live blocks pick them up automatically.</p>
        </Card>
      </div>
    </Page>
  );
}
