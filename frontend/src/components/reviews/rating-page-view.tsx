"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useSession } from "@/lib/session";
import {
  fetchQrStats,
  fetchReviewSettings,
  updateReviewSettings,
  uploadReviewLogo,
  removeReviewLogo,
  generateQrPoster,
  type QrPosterFormat,
  type QrPosterFileType,
} from "@/lib/reviews-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

const FORMAT_DIMENSIONS: Record<QrPosterFormat, string> = { a5: "A5 — 148 × 210mm", a4: "A4 — 210 × 297mm", sticker: "Sticker — 80 × 80mm" };

export function RatingPageView() {
  const session = useSession();
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [publicPreviewOpen, setPublicPreviewOpen] = useState(false);
  const [publicUrlOpen, setPublicUrlOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const { data: stats } = useQuery({ queryKey: ["qr-stats"], queryFn: fetchQrStats });
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: fetchReviewSettings });

  const targetUrl = typeof window !== "undefined" ? `${window.location.origin}/rq/${session.business.slug}` : "";
  const starDist = [5, 4, 3, 2, 1];

  function copyLink() {
    navigator.clipboard.writeText(targetUrl).then(
      () => toast.success("Link copied."),
      () => toast.error("Couldn't copy — copy it manually."),
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Rating Page</h2>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={copyLink} style={outlineBtn}>Copy Link</button>
          <button type="button" onClick={() => setQrOpen(true)} style={outlineBtn}>Download QR</button>
          <button type="button" onClick={() => setBrandingOpen(true)} style={outlineBtn}>Customise Branding</button>
          <button type="button" onClick={() => setPublicPreviewOpen(true)} style={primaryBtn}>Preview Page</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <Kpi label={`Page Visits (${stats?.windowDays ?? 30}d)`} value={stats ? String(stats.pageVisits) : "…"} />
        <Kpi label="Ratings Submitted" value={stats ? String(stats.ratingsSubmitted) : "…"} />
        <Kpi label="Conversion" value={stats ? `${stats.conversionRate}%` : "…"} color="var(--app-primary)" />
        <Kpi label={`QR Scans (${stats?.windowDays ?? 30}d)`} value={stats ? String(stats.visits) : "…"} />
      </div>

      {!settings?.publicReviewUrl && (
        <div className="rounded-[12px] p-[13px] text-[12.5px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)", color: "var(--app-warning-text)" }}>
          No public review platform is set yet — 4-5★ ratings stay private for now instead of redirecting to a public listing. Set one below.
        </div>
      )}

      <div className="grid items-start gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Ratings by star</h3>
          <p className="m-0 mb-3 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Every submitted rating goes through this exact same page — nothing is filtered before it lands here.</p>
          {stats && stats.ratingsSubmitted > 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{stats.ratingsSubmitted} rating{stats.ratingsSubmitted === 1 ? "" : "s"} submitted in the last {stats.windowDays} days.</p>
          ) : (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No ratings submitted yet in this window.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3" style={{ borderTop: "1px solid var(--app-surface-2)", paddingTop: 14 }}>
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Public review URL</div>
              <div className="mt-1 break-all text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{settings?.publicReviewUrl || "Not set yet"}</div>
            </div>
            <button type="button" onClick={() => setPublicUrlOpen(true)} className="ml-auto" style={{ ...outlineBtn, padding: "9px 13px", minHeight: 42 }}>Configure</button>
          </div>
        </div>
        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Live preview</h3></div>
          <div className="p-[18px]" style={{ background: "var(--app-bg)" }}>
            <RatingPagePreview businessName={session.business.name} logoUrl={settings?.logoUrl ?? null} brandColor={settings?.brandColor ?? "#12A150"} starDist={starDist} />
          </div>
        </div>
      </div>

      {brandingOpen && <BrandingDrawer businessName={session.business.name} onClose={() => setBrandingOpen(false)} onPreview={() => { setBrandingOpen(false); setPublicPreviewOpen(true); }} />}
      {publicPreviewOpen && (
        <SidePanel title="Public Page Preview" onClose={() => setPublicPreviewOpen(false)}>
          <div className="flex flex-col gap-3.5">
            <RatingPagePreview businessName={session.business.name} logoUrl={settings?.logoUrl ?? null} brandColor={settings?.brandColor ?? "#12A150"} starDist={starDist} big />
            <div className="rounded-[12px] p-[13px] text-[12px] leading-relaxed" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)", color: "var(--app-success-text)" }}>
              Every customer sees this exact page and the same platform choices, whatever star rating they pick. Nobody is routed away from public platforms.
            </div>
          </div>
        </SidePanel>
      )}
      {publicUrlOpen && <PublicUrlDialog onClose={() => setPublicUrlOpen(false)} />}
      {qrOpen && <QrDialog targetUrl={targetUrl} onClose={() => setQrOpen(false)} />}
    </main>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{label}</div>
      <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: color ?? "var(--app-text)" }}>{value}</div>
    </div>
  );
}

/** Mirrors the real public flow's actual copy and behavior (`components/public/public-rating-flow.tsx`)
 * exactly — this is a preview, so it must show customers what they really see, not a fabricated
 * mockup step (there's no separate "Continue" button in the real flow; tapping a star submits or
 * opens the private-feedback form immediately). */
function RatingPagePreview({ businessName, logoUrl, brandColor, starDist, big }: { businessName: string; logoUrl: string | null; brandColor: string; starDist: number[]; big?: boolean }) {
  return (
    <div className="rounded-[14px] p-[18px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external S3-signed URL
        <img src={logoUrl} alt="" className="mx-auto h-11 w-11 rounded-[12px] object-cover" />
      ) : (
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[12px] text-[20px] font-extrabold text-white" style={{ background: brandColor }}>
          {businessName.slice(0, 1)}
        </div>
      )}
      <div className="mt-2.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>How was your visit to {businessName}?</div>
      <div className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>Tap a star to rate your experience.</div>
      <div className="mt-3.5 flex justify-center gap-1.5">
        {starDist.map((n) => (
          <svg key={n} width={big ? 30 : 26} height={big ? 30 : 26} viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B">
            <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8Z" />
          </svg>
        ))}
      </div>
      <div className="mt-3.5 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-disabled)" }}>4-5★ goes straight to your public platforms below; 1-3★ opens a private feedback box instead.</div>
    </div>
  );
}

function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[85]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(10,27,42,.36)" }} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col" style={{ background: "var(--app-surface)", boxShadow: "-18px 0 46px rgba(10,27,42,.18)" }}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-[17px]">{children}</div>
      </aside>
    </div>
  );
}

function BrandingDrawer({ businessName, onClose, onPreview }: { businessName: string; onClose: () => void; onPreview: () => void }) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: fetchReviewSettings });
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const brandColor = pendingColor ?? settings?.brandColor ?? "#12A150";

  const colorMutation = useMutation({
    mutationFn: (color: string) => updateReviewSettings({ brandColor: color }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["review-settings"] }); setPendingColor(null); },
    onError: (err) => { setPendingColor(null); toast.error(err instanceof ApiError ? err.message : "Couldn't save the brand colour."); },
  });
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadReviewLogo(file),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["review-settings"] }); toast.success("Logo updated."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't upload this logo."),
  });
  const removeMutation = useMutation({
    mutationFn: () => removeReviewLogo(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["review-settings"] }); toast.success("Logo removed."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this logo."),
  });

  return (
    <SidePanel title="Customise Branding" onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <div>
          <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Logo</label>
          <div className="flex items-center gap-3" style={{ border: "1px dashed var(--app-border-strong)", borderRadius: 12, padding: 13 }}>
            <input type="file" id="rp-logo" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); e.target.value = ""; }} />
            <label htmlFor="rp-logo" className="cursor-pointer rounded-[10px] px-[13px] py-2.5 text-[12px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)" }}>
              {uploadMutation.isPending ? "Uploading…" : settings?.logoUrl ? "Replace" : "Upload"}
            </label>
            <span className="flex-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>PNG or SVG, at least 200×200</span>
            {settings?.logoUrl && (
              <button type="button" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending} className="text-[12px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Remove</button>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Brand colour</label>
          <div className="flex items-center gap-2.5">
            <input type="color" value={brandColor} onChange={(e) => { setPendingColor(e.target.value); colorMutation.mutate(e.target.value); }} className="h-10 w-14 cursor-pointer rounded-[10px]" style={{ border: "1px solid var(--app-border)" }} />
            <span className="font-mono text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{brandColor}</span>
          </div>
        </div>
        <div className="rounded-[14px] p-4" style={{ background: "var(--app-surface-2)" }}>
          <div className="mb-2.5 text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Live preview</div>
          <RatingPagePreview businessName={businessName} logoUrl={settings?.logoUrl ?? null} brandColor={brandColor} starDist={[5, 4, 3, 2, 1]} />
        </div>
        <div className="flex gap-[9px] pt-3.5" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={onPreview} style={outlineBtn}>Preview</button>
          <button type="button" onClick={onClose} style={{ ...primaryBtn, flex: 1 }}>Done</button>
        </div>
      </div>
    </SidePanel>
  );
}

function PublicUrlDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: fetchReviewSettings });
  const [platform, setPlatform] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const effectivePlatform = platform ?? settings?.publicReviewPlatform ?? "google";
  const effectiveUrl = url ?? settings?.publicReviewUrl ?? "";

  const mutation = useMutation({
    mutationFn: () => updateReviewSettings({ publicReviewPlatform: effectivePlatform, publicReviewUrl: effectiveUrl.trim() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["review-settings"] }); toast.success("Public review URL saved."); onClose(); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this — please try again."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div className="w-[490px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Public Review URL</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <div>
            <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Platform</label>
            <select value={effectivePlatform} onChange={(e) => setPlatform(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", minHeight: 48 }}>
              <option value="google">Google</option>
              <option value="facebook">Facebook</option>
              <option value="yelp">Yelp</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-[5px] block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Public review URL</label>
            <input value={effectiveUrl} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
          </div>
          <div className="rounded-[12px] p-[13px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)" }}>
            <div className="text-[12px] font-extrabold" style={{ color: "#93370D" }}>No listing on this platform yet?</div>
            <div className="mt-[5px] text-[12px] leading-relaxed" style={{ color: "var(--app-warning-text)" }}>Leave the URL blank. Customers will simply not see that option — Noxtill will not send them anywhere you are not actually listed.</div>
          </div>
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={primaryBtn}>{mutation.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function QrDialog({ targetUrl, onClose }: { targetUrl: string; onClose: () => void }) {
  const [format, setFormat] = useState<QrPosterFormat>("a5");
  const mutation = useMutation({
    mutationFn: (fileType: QrPosterFileType) => generateQrPoster({ format, fileType, targetUrl }),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate the poster — please try again."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div className="w-[490px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Download QR</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3.5 p-[17px]">
          <div className="flex flex-wrap gap-2">
            {(["a5", "a4", "sticker"] as QrPosterFormat[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFormat(k)}
                className="rounded-[11px] px-[15px] py-2.5 text-[12.5px] font-bold"
                style={{ border: `1px solid ${format === k ? "var(--app-primary)" : "var(--app-border)"}`, background: format === k ? "var(--app-success-bg)" : "var(--app-surface)", color: format === k ? "var(--app-success-text)" : "var(--app-text-muted)" }}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex justify-center rounded-[14px] p-5" style={{ background: "var(--app-surface-2)" }}>
            <div className="rounded-[13px] p-4 text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <QRCodeSVG value={targetUrl} size={140} level="M" marginSize={0} />
              <div className="mt-2.5 text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{FORMAT_DIMENSIONS[format]}</div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate("png")} disabled={mutation.isPending} style={outlineBtn}>{mutation.isPending ? "Generating…" : "Download PNG"}</button>
          <button type="button" onClick={() => mutation.mutate("pdf")} disabled={mutation.isPending} style={primaryBtn}>{mutation.isPending ? "Generating…" : "Download PDF"}</button>
        </div>
      </div>
    </div>
  );
}
