"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { formatPercent } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchBookingLinkSettings,
  updateBookingLinkSettings,
  fetchBookingLinkStats,
  generateBookingQr,
  type BookingLinkSettings,
  type GenerateQrInput,
} from "@/lib/booking-link-api";
import { updateDepositSettings, fetchDepositSettings } from "@/lib/deposits-api";
import { fetchProducts } from "@/lib/products-api";
import { useSession } from "@/lib/session";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 44 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };

const RANGE_OPTIONS = [
  { key: 1, label: "Last 30 days" },
  { key: 6, label: "Last 6 months" },
  { key: 12, label: "Last 12 months" },
] as const;

export function BookingLinkPanel() {
  const session = useSession();
  const [months, setMonths] = useState<number>(6);
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const { data: stats } = useQuery({ queryKey: ["booking-link-stats", months], queryFn: () => fetchBookingLinkStats(months) });
  const bookingUrl = `${window.location.origin}/book/${session.business.slug}`;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Booking Link</h2>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Date range" style={selectStyle}>
          {RANGE_OPTIONS.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3.5 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]" style={{ background: "var(--app-success-bg)", color: "var(--app-primary)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1L11 4.9M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1L13 19.1" /></svg>
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Your public booking page</span>
          <span className="mt-0.5 block truncate text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{bookingUrl}</span>
        </span>
        <span className="ms-auto flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(bookingUrl).catch(() => undefined); toast.success("Link copied."); }}
            style={primaryHeaderBtn}
          >
            Copy Link
          </button>
          <button type="button" onClick={() => setQrOpen(true)} style={outlineBtn}>Download QR</button>
          <button type="button" onClick={() => window.open(bookingUrl, "_blank", "noopener,noreferrer")} style={outlineBtn}>Preview Public Page</button>
          <button type="button" onClick={() => setCustomiseOpen(true)} style={outlineBtn}>Customise Page</button>
        </span>
      </div>

      {stats && (
        <>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Link Visits</div>
              <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats.totalVisits}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Bookings From Link</div>
              <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{stats.totalBookings}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Conversion</div>
              <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatPercent(stats.conversion)}</div>
            </div>
          </div>

          {stats.trend.length > 1 && (
            <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-3.5">
                <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Visits vs bookings</h3>
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}><span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--app-border-strong)" }} />Visits</span>
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}><span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--app-primary)" }} />Bookings</span>
              </div>
              <VisitsChart trend={stats.trend} />
            </div>
          )}
        </>
      )}

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Generate a QR poster</h3>
        <p className="m-0 mb-3 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Real signed file from your public page — print it and post it wherever customers can scan it.</p>
        <QrGenerator />
      </div>

      {customiseOpen && <CustomiseModal onClose={() => setCustomiseOpen(false)} />}
      {qrOpen && <QrModal onClose={() => setQrOpen(false)} />}
    </main>
  );
}

function QrGenerator() {
  const [format, setFormat] = useState<GenerateQrInput["format"]>("a5");
  const [fileType, setFileType] = useState<GenerateQrInput["fileType"]>("png");

  const mutation = useMutation({
    mutationFn: () => generateBookingQr({ format, fileType }),
    onSuccess: (result) => { window.open(result.url, "_blank", "noopener,noreferrer"); toast.success("QR poster generated."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate the QR poster."),
  });

  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <select value={format} onChange={(e) => setFormat(e.target.value as GenerateQrInput["format"])} aria-label="Size" style={selectStyle}>
        <option value="a5">A5</option>
        <option value="a4">A4</option>
        <option value="sticker">Sticker</option>
      </select>
      <select value={fileType} onChange={(e) => setFileType(e.target.value as GenerateQrInput["fileType"])} aria-label="File type" style={selectStyle}>
        <option value="png">PNG</option>
        <option value="pdf">PDF</option>
      </select>
      <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...primaryHeaderBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
        {mutation.isPending ? "Generating…" : "Generate"}
      </button>
    </div>
  );
}

function QrModal({ onClose }: { onClose: () => void }) {
  return (
    <PosModalShell open onClose={onClose} title="Download QR" footer={<button type="button" onClick={onClose} style={cancelBtn}>Close</button>}>
      <div className="p-[17px]">
        <QrGenerator />
      </div>
    </PosModalShell>
  );
}

function VisitsChart({ trend }: { trend: { month: string; visits: number; bookings: number }[] }) {
  const width = 620;
  const height = 150;
  const max = Math.max(...trend.map((t) => t.visits), 1);
  const barWidth = width / trend.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, display: "block" }}>
      {trend.map((t, i) => {
        const vH = (t.visits / max) * (height - 20);
        const bH = (t.bookings / max) * (height - 20);
        const x = i * barWidth;
        return (
          <g key={t.month}>
            <rect x={x + 4} y={height - 20 - vH} width={Math.max(barWidth - 8, 2)} height={vH} rx={4} fill="var(--app-border-strong)" />
            <rect x={x + 4} y={height - 20 - bH} width={Math.max((barWidth - 8) / 2, 2)} height={bH} rx={4} fill="var(--app-primary)" />
            <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" fontSize="10.5" fill="var(--app-text-faint)" fontWeight={600}>{t.month}</text>
          </g>
        );
      })}
    </svg>
  );
}

function CustomiseModal({ onClose }: { onClose: () => void }) {
  const { data: settings, isPending: settingsPending } = useQuery({ queryKey: ["booking-link-settings"], queryFn: fetchBookingLinkSettings });
  const { data: depositSettings, isPending: depositPending } = useQuery({ queryKey: ["deposit-settings"], queryFn: fetchDepositSettings });
  const { data: services } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }) });

  if (settingsPending || depositPending || !settings || !depositSettings) {
    return (
      <PosModalShell open onClose={onClose} title="Customise Your Booking Page" footer={<button type="button" onClick={onClose} style={cancelBtn}>Close</button>}>
        <p className="m-0 p-[17px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</p>
      </PosModalShell>
    );
  }
  return <CustomiseForm settings={settings} depositRequired={depositSettings.required} services={services ?? []} onClose={onClose} />;
}

function CustomiseForm({ settings, depositRequired, services, onClose }: { settings: BookingLinkSettings; depositRequired: boolean; services: { id: string; name: string }[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [welcomeText, setWelcomeText] = useState(settings.welcomeText ?? "");
  const [visibleServiceIds, setVisibleServiceIds] = useState<string[]>(settings.visibleServiceIds);
  const [brandColor, setBrandColor] = useState(settings.brandColor ?? "#12A150");
  const [requireDeposit, setRequireDeposit] = useState(depositRequired);

  const mutation = useMutation({
    mutationFn: async () => {
      await updateBookingLinkSettings({ welcomeText: welcomeText || undefined, visibleServiceIds, brandColor });
      if (requireDeposit !== depositRequired) await updateDepositSettings({ required: requireDeposit });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-link-settings"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-settings"] });
      toast.success("Booking page updated.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these changes."),
  });

  function toggleService(id: string) {
    setVisibleServiceIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  return (
    <PosModalShell
      open
      onClose={onClose}
      title="Customise Your Booking Page"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...primaryBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>WELCOME TEXT</span>
          <textarea value={welcomeText} onChange={(e) => setWelcomeText(e.target.value)} rows={2} placeholder="Book with us in under a minute." className="w-full rounded-[11px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <div>
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>WHICH SERVICES SHOW (BLANK = ALL)</span>
          <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-[11px] p-1" style={{ border: "1px solid var(--app-border)" }}>
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 p-2 text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                <input type="checkbox" checked={visibleServiceIds.includes(s.id)} onChange={() => toggleService(s.id)} style={{ accentColor: "var(--app-primary)" }} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>BRAND COLOUR</span>
          <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded-[9px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
        <label className="flex items-center gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Require a deposit to book</span>
          <input type="checkbox" checked={requireDeposit} onChange={(e) => setRequireDeposit(e.target.checked)} style={{ accentColor: "var(--app-primary)", width: 18, height: 18 }} />
        </label>
      </div>
    </PosModalShell>
  );
}
