"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { fetchReviewWidget } from "@/lib/public-review-api";
import { toast } from "@/lib/toast";

type WidgetTheme = "Light" | "Dark";
type WidgetLayout = "Carousel" | "Grid" | "Badge";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? "/api/v1" : process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:5000/api/v1");

const EMBED_TABS: { key: string; note: string }[] = [
  { key: "WordPress", note: "Paste the embed code into a Custom HTML block in the block editor." },
  { key: "Wix", note: "Add an Embed → Custom Embeds → Embed a Widget element and paste the code." },
  { key: "Shopify", note: "In your theme editor, add a Custom Liquid section and paste the code." },
  { key: "Plain HTML", note: "Paste the snippet anywhere inside your page <body>." },
];

function starList(n: number) {
  return [1, 2, 3, 4, 5].map((i) => i <= n);
}
function Stars({ n, size = 13 }: { n: number; size?: number }) {
  return (
    <span className="flex gap-0.5">
      {starList(n).map((filled, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={filled ? "#F59E0B" : "#E1E7EE"} stroke={filled ? "#F59E0B" : "#E1E7EE"}>
          <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8Z" />
        </svg>
      ))}
    </span>
  );
}

export function ReviewWidgetView() {
  const session = useSession();
  const [layout, setLayout] = useState<WidgetLayout>("Carousel");
  const [theme, setTheme] = useState<WidgetTheme>("Light");
  const [minRating, setMinRating] = useState(4);
  const [embedTab, setEmbedTab] = useState("WordPress");

  const { data } = useQuery({ queryKey: ["review-widget", session.business.slug, minRating], queryFn: () => fetchReviewWidget(session.business.slug, minRating) });
  const reviews = data?.reviews ?? [];
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length : 0;

  const dark = theme === "Dark";
  const wgBg = dark ? "var(--app-sidebar-bg)" : "var(--app-surface)";
  const wgFg = dark ? "#fff" : "var(--app-text)";
  const wgSub = dark ? "var(--app-sidebar-fg)" : "var(--app-text-faintest)";
  const wgBd = dark ? "var(--app-sidebar-border)" : "var(--app-border)";

  const snippet = `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widget.js" data-business="${session.business.slug}" data-theme="${theme.toLowerCase()}" data-layout="${layout.toLowerCase()}" data-min-rating="${minRating}" data-api="${API_BASE}"></script>`;

  function copyEmbed() {
    navigator.clipboard.writeText(snippet).then(
      () => toast.success("Embed code copied to clipboard."),
      () => toast.error("Couldn't copy — select and copy the snippet manually."),
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Website Widget</h2>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={copyEmbed} className="rounded-[11px] px-[18px] py-[11px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Copy Embed Code</button>
        </div>
      </div>

      <div className="rounded-[12px] p-[13px] text-[12px]" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
        View/click analytics for this widget aren&apos;t tracked yet — the embed itself is fully live and pulls your real public reviews below.
      </div>

      <div className="grid items-start gap-[15px]" style={{ gridTemplateColumns: "300px minmax(0,1fr)" }}>
        <div className="flex flex-col gap-3.5 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Customise</h3>
          <Field label="Layout">
            <select value={layout} onChange={(e) => setLayout(e.target.value as WidgetLayout)} style={selectStyle}>
              <option>Carousel</option><option>Grid</option><option>Badge</option>
            </select>
          </Field>
          <Field label="Theme">
            <select value={theme} onChange={(e) => setTheme(e.target.value as WidgetTheme)} style={selectStyle}>
              <option>Light</option><option>Dark</option>
            </select>
          </Field>
          <Field label="Minimum rating shown">
            <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} style={selectStyle}>
              <option value={3}>3</option><option value={4}>4</option><option value={5}>5</option>
            </select>
          </Field>
          <div className="rounded-[11px] p-[11px] text-[11.5px] leading-relaxed" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-surface-2)", color: "var(--app-text-faint)" }}>
            The widget only shows public reviews. Private feedback is never displayed.
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-[15px]">
          <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Live preview</h3></div>
            <div className="p-5" style={{ background: "var(--app-bg)" }}>
              {reviews.length === 0 ? (
                <div className="rounded-[14px] p-[44px_18px] text-center" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-border-strong)" }}>
                  <p className="m-0 text-[14px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Add reviews first, then embed them on your website</p>
                  <p className="m-0 mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No public reviews meet the minimum rating.</p>
                </div>
              ) : layout === "Badge" ? (
                <div className="inline-flex items-center gap-3.5 rounded-[14px] p-[17px]" style={{ background: wgBg, border: `1px solid ${wgBd}` }}>
                  {data?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external S3-signed URL
                    <img src={data.logoUrl} alt="" className="h-10 w-10 rounded-[11px] object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-[11px] text-[18px] font-extrabold text-white" style={{ background: data?.brandColor || "var(--app-primary)" }}>
                      {(data?.businessName ?? session.business.name).slice(0, 1)}
                    </span>
                  )}
                  <span>
                    <span className="flex items-center gap-1.5"><span className="text-[19px] font-extrabold" style={{ color: wgFg }}>{avgRating.toFixed(1)}</span><Stars n={Math.round(avgRating)} /></span>
                    <span className="mt-0.5 block text-[11.5px]" style={{ color: wgSub }}>{reviews.length} reviews on Noxtill</span>
                  </span>
                </div>
              ) : layout === "Grid" ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
                  {reviews.slice(0, 6).map((r, i) => (
                    <div key={i} className="rounded-[13px] p-3.5" style={{ background: wgBg, border: `1px solid ${wgBd}` }}>
                      <Stars n={r.stars} />
                      <p className="m-0 mt-2 text-[12px] leading-relaxed" style={{ color: wgFg }}>{r.text && r.text.length > 90 ? `${r.text.slice(0, 90)}…` : (r.text ?? "")}</p>
                      <div className="mt-2 text-[11px]" style={{ color: wgSub }}>{r.author ?? "Anonymous"} · {r.platform}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] p-[17px]" style={{ background: wgBg, border: `1px solid ${wgBd}` }}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[16px] font-extrabold" style={{ color: wgFg }}>{avgRating.toFixed(1)}</span>
                    <Stars n={Math.round(avgRating)} size={14} />
                    <span className="text-[11.5px]" style={{ color: wgSub }}>{reviews.length} reviews</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {reviews.slice(0, 6).map((r, i) => (
                      <div key={i} className="rounded-[12px] p-3.5" style={{ flex: "0 0 240px", border: `1px solid ${wgBd}` }}>
                        <Stars n={r.stars} size={12} />
                        <p className="m-0 mt-2 text-[12px] leading-relaxed" style={{ color: wgFg }}>{r.text && r.text.length > 90 ? `${r.text.slice(0, 90)}…` : (r.text ?? "")}</p>
                        <div className="mt-2 text-[11px]" style={{ color: wgSub }}>{r.author ?? "Anonymous"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <h3 className="m-0 mb-2.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Embed instructions</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {EMBED_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setEmbedTab(t.key)}
                  className="rounded-full px-3.5 py-2 text-[12px] font-bold"
                  style={{ border: `1px solid ${embedTab === t.key ? "var(--app-sidebar-bg)" : "var(--app-border)"}`, background: embedTab === t.key ? "var(--app-sidebar-bg)" : "var(--app-surface)", color: embedTab === t.key ? "#fff" : "var(--app-text-faint)" }}
                >
                  {t.key}
                </button>
              ))}
            </div>
            <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{EMBED_TABS.find((t) => t.key === embedTab)?.note}</p>
            <div className="mt-[11px] overflow-x-auto whitespace-pre rounded-[11px] p-[13px] font-mono text-[11.5px]" style={{ background: "var(--app-sidebar-bg)", color: "#8FF0BB" }}>{snippet}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

const selectStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 11, fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 46 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-[5px] block text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>{label}</label>
      {children}
    </div>
  );
}
