"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Save, Send, Smartphone } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { websiteApi, type Theme } from "@/lib/website-api";
import { onColor } from "@/lib/website-theme";
import { Btn, Card, Field, Kpi, Notice, Page, StatusBadge, errorText, inputClass, inputStyle } from "./website-ui";

const PRESETS = [
  { key: "clean", label: "Clean", swatch: ["#1d4ed8", "#ffffff", "#111827"] },
  { key: "warm", label: "Warm", swatch: ["#9a3412", "#fffaf5", "#2b1d14"] },
  { key: "bold", label: "Bold (dark)", swatch: ["#7c3aed", "#0f0f14", "#f4f4f6"] },
];
const FONTS = ["Inter", "Georgia", "Merriweather", "Poppins", "Lora", "Roboto", "system-ui"];
const COLOR_LABELS: Record<keyof Theme["colors"], string> = {
  primary: "Primary (buttons, links)",
  accent: "Accent",
  background: "Page background",
  surface: "Card background",
  text: "Text",
  muted: "Secondary text",
};

export function WebsiteThemesView() {
  useModuleHeader({ title: "Themes & Branding", subtitle: "Colours, fonts and layout for your website" });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["website", "theme"], queryFn: websiteApi.theme });
  const [edited, setTheme] = useState<Theme | null>(null);
  const theme = edited ?? q.data?.draft ?? null;
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => websiteApi.saveTheme(theme!),
    onSuccess: () => { setMessage({ tone: "ok", text: "Theme saved as a draft." }); setTheme(null); void qc.invalidateQueries({ queryKey: ["website"] }); },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });
  const publish = useMutation({
    mutationFn: () => websiteApi.publishSite({ theme: true }),
    onSuccess: (d) => { setMessage({ tone: "ok", text: `Theme published (deployment #${d.number}). Roll back any time in Domains & Publishing.` }); void qc.invalidateQueries({ queryKey: ["website"] }); },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });

  if (q.isLoading || !theme) return <Page><p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p></Page>;
  if (q.isError || !q.data) return <Page><Notice tone="danger">{errorText(q.error)}</Notice></Page>;
  const dirty = JSON.stringify(theme) !== JSON.stringify(q.data.draft);
  const set = (patch: Partial<Theme>) => setTheme({ ...theme, ...patch });
  const failing = q.data.contrast.filter((c) => !c.passes);
  const brandDone = [theme.logoUrl, theme.faviconUrl].filter(Boolean).length;

  return (
    <Page>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Active theme" value={q.data.live ? PRESETS.find((p) => p.key === q.data.live!.preset)?.label ?? q.data.live.preset : "Not published"} />
        <Kpi label="Draft changes" value={q.data.changed ? "Yes" : "None"} tone={q.data.changed ? "warn" : undefined} />
        <Kpi label="Brand assets" value={`${brandDone}/2`} hint="Logo and favicon" />
        <Kpi label="Accessibility warnings" value={failing.length} tone={failing.length ? "danger" : "ok"} hint="Saved draft, WCAG AA contrast" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card
          title="Theme settings"
          actions={
            <>
              <Btn onClick={() => save.mutate()} disabled={!dirty || save.isPending}><Save className="h-3.5 w-3.5" aria-hidden /> Save draft</Btn>
              <Btn variant="primary" onClick={() => publish.mutate()} disabled={dirty || !q.data.changed || publish.isPending}><Send className="h-3.5 w-3.5" aria-hidden /> Publish theme</Btn>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div>
              <p className="m-0 mb-2 text-xs font-bold">Preset</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.key} type="button" aria-pressed={theme.preset === p.key} onClick={() => setTheme({ ...theme, preset: p.key, colors: { ...theme.colors, primary: p.swatch[0], background: p.swatch[1], text: p.swatch[2] } })} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: theme.preset === p.key ? "var(--app-primary)" : "var(--app-border)" }}>
                    {p.swatch.map((c) => <span key={c} className="h-3 w-3 rounded-full border" style={{ background: c, borderColor: "var(--app-border)" }} />)} {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(Object.keys(COLOR_LABELS) as (keyof Theme["colors"])[]).map((k) => (
                <Field key={k} label={COLOR_LABELS[k]}>
                  <span className="flex items-center gap-2">
                    <input type="color" aria-label={COLOR_LABELS[k]} value={theme.colors[k]} onChange={(e) => set({ colors: { ...theme.colors, [k]: e.target.value } })} className="h-8 w-10 rounded border" style={{ borderColor: "var(--app-border)" }} />
                    <code className="text-[11px]">{theme.colors[k]}</code>
                  </span>
                </Field>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Heading font"><select className={inputClass} style={inputStyle} value={theme.fontHeading} onChange={(e) => set({ fontHeading: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Body font"><select className={inputClass} style={inputStyle} value={theme.fontBody} onChange={(e) => set({ fontBody: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label={`Corner radius: ${theme.radius}px`}><input type="range" min={0} max={24} value={theme.radius} onChange={(e) => set({ radius: Number(e.target.value) })} /></Field>
              <Field label={`Content width: ${theme.layoutWidth}px`}><input type="range" min={880} max={1440} step={40} value={theme.layoutWidth} onChange={(e) => set({ layoutWidth: Number(e.target.value) })} /></Field>
              <Field label="Buttons"><select className={inputClass} style={inputStyle} value={theme.buttonStyle} onChange={(e) => set({ buttonStyle: e.target.value as Theme["buttonStyle"] })}><option value="solid">Solid</option><option value="outline">Outline</option></select></Field>
              <Field label="Header"><select className={inputClass} style={inputStyle} value={theme.headerStyle} onChange={(e) => set({ headerStyle: e.target.value as Theme["headerStyle"] })}><option value="light">Light</option><option value="dark">Dark</option><option value="brand">Brand colour</option></select></Field>
              <Field label="Logo URL" hint="An https image address. The file stays where it is hosted."><input className={inputClass} style={inputStyle} value={theme.logoUrl} placeholder="https://" onChange={(e) => set({ logoUrl: e.target.value })} /></Field>
              <Field label="Favicon URL"><input className={inputClass} style={inputStyle} value={theme.faviconUrl} placeholder="https://" onChange={(e) => set({ faviconUrl: e.target.value })} /></Field>
            </div>
            <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Custom CSS and scripts are not allowed, so nothing can inject code into your public site.</p>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Preview" actions={<><Btn aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor className="h-3.5 w-3.5" aria-hidden /> Desktop</Btn><Btn aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone className="h-3.5 w-3.5" aria-hidden /> Mobile</Btn></>}>
            <div className="mx-auto overflow-hidden rounded-xl border" style={{ maxWidth: device === "mobile" ? 360 : "100%", borderColor: "var(--app-border)", background: theme.colors.background, color: theme.colors.text, fontFamily: theme.fontBody }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ background: theme.headerStyle === "dark" ? "#111827" : theme.headerStyle === "brand" ? theme.colors.primary : theme.colors.background, color: theme.headerStyle === "light" ? theme.colors.text : theme.headerStyle === "brand" ? onColor(theme.colors.primary) : "#fff" }}>
                <strong style={{ fontFamily: theme.fontHeading }}>Your business</strong>
                <span className="text-xs">Home · Shop · Contact</span>
              </div>
              <div className="p-5">
                <h3 className="m-0 text-2xl font-bold" style={{ fontFamily: theme.fontHeading }}>Welcome in</h3>
                <p className="m-0 mt-1 text-sm" style={{ color: theme.colors.muted }}>Secondary text looks like this.</p>
                <button type="button" className="mt-3 px-4 py-2 text-sm font-semibold" style={{ borderRadius: theme.radius, border: `2px solid ${theme.colors.primary}`, background: theme.buttonStyle === "solid" ? theme.colors.primary : "transparent", color: theme.buttonStyle === "solid" ? onColor(theme.colors.primary) : theme.colors.primary }}>Shop now</button>
                <div className="mt-4 p-3 text-sm" style={{ background: theme.colors.surface, borderRadius: theme.radius }}>A card on the surface colour. <a style={{ color: theme.colors.primary }}>A link</a>.</div>
              </div>
            </div>
          </Card>
          <Card title="Contrast checks (saved draft)">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
              {q.data.contrast.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-2">
                  <span>{c.label}</span>
                  <span className="flex items-center gap-2"><code>{c.ratio}:1</code><StatusBadge status={c.passes ? "verified" : "failed"} label={c.passes ? "Passes AA" : `Needs ${c.minimum}:1`} /></span>
                </li>
              ))}
            </ul>
            {dirty && <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Save the draft to re-check your unsaved colours.</p>}
          </Card>
        </div>
      </div>
    </Page>
  );
}
