"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2, Copy, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
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

export function BookingLinkPanel() {
  const session = useSession();
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [format, setFormat] = useState<GenerateQrInput["format"]>("a5");
  const [fileType, setFileType] = useState<GenerateQrInput["fileType"]>("png");

  const { data: stats, isPending, isError, refetch } = useQuery({ queryKey: ["booking-link-stats"], queryFn: () => fetchBookingLinkStats(6) });

  const bookingUrl = `${window.location.origin}/book/${session.business.slug}`;

  const qrMutation = useMutation({
    mutationFn: () => generateBookingQr({ format, fileType }),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("QR poster generated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate the QR poster."),
  });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-fg-muted">Your public booking link</p>
            <p className="truncate text-sm font-medium text-fg">{bookingUrl}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(bookingUrl).catch(() => undefined);
                toast.success("Link copied.");
              }}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCustomiseOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              Customise
            </Button>
          </div>
        </CardContent>
      </Card>

      {isError && <ErrorBanner title="Couldn't load booking link stats" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-fg-muted">Visits (6mo)</p>
                <p className="font-display text-xl font-bold text-fg">{stats.totalVisits}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-fg-muted">Bookings</p>
                <p className="font-display text-xl font-bold text-fg">{stats.totalBookings}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-fg-muted">Conversion</p>
                <p className="font-display text-xl font-bold text-fg">{formatPercent(stats.conversion)}</p>
              </CardContent>
            </Card>
          </div>

          {stats.trend.length > 1 && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-3 text-sm font-medium text-fg">Visits vs. bookings</p>
                <VisitsTrendChart trend={stats.trend} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3.5 p-4">
          <p className="text-sm font-medium text-fg">Generate a QR poster</p>
          <div className="flex flex-wrap items-end gap-3">
            <Select label="Size" value={format} onChange={(e) => setFormat(e.target.value as GenerateQrInput["format"])} className="w-32">
              <option value="a5">A5</option>
              <option value="a4">A4</option>
              <option value="sticker">Sticker</option>
            </Select>
            <Select label="File type" value={fileType} onChange={(e) => setFileType(e.target.value as GenerateQrInput["fileType"])} className="w-32">
              <option value="png">PNG</option>
              <option value="pdf">PDF</option>
            </Select>
            <Button onClick={() => qrMutation.mutate()} disabled={qrMutation.isPending}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              {qrMutation.isPending ? "Generating…" : "Generate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <CustomiseDialog open={customiseOpen} onClose={() => setCustomiseOpen(false)} />
    </div>
  );
}

function VisitsTrendChart({ trend }: { trend: { month: string; visits: number; bookings: number }[] }) {
  const width = 560;
  const height = 140;
  const max = Math.max(...trend.map((t) => t.visits), 1);
  const visitPoints = trend.map((t, i) => ({ x: (i / (trend.length - 1)) * width, y: height - (t.visits / max) * height }));
  const bookingPoints = trend.map((t, i) => ({ x: (i / (trend.length - 1)) * width, y: height - (t.bookings / max) * height }));
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Visits vs bookings trend">
        <path d={path(visitPoints)} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={path(bookingPoints)} fill="none" stroke="var(--chart-2, var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-1)" }} /> Visits
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2, var(--primary))" }} /> Bookings
        </span>
      </div>
    </div>
  );
}

function CustomiseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: settings, isPending: settingsPending } = useQuery({ queryKey: ["booking-link-settings"], queryFn: fetchBookingLinkSettings, enabled: open });
  const { data: depositSettings, isPending: depositPending } = useQuery({ queryKey: ["deposit-settings"], queryFn: fetchDepositSettings, enabled: open });
  const { data: services } = useQuery({ queryKey: ["products", "services-for-booking-link"], queryFn: () => fetchProducts({ kind: "service" }), enabled: open });

  if (!open) return null;
  if (settingsPending || depositPending || !settings || !depositSettings) {
    return (
      <Dialog open onClose={onClose} title="Customise your booking page">
        <SkeletonRow />
      </Dialog>
    );
  }
  return (
    <CustomiseForm
      settings={settings}
      depositRequired={depositSettings.required}
      services={services ?? []}
      onClose={onClose}
    />
  );
}

function CustomiseForm({
  settings,
  depositRequired,
  services,
  onClose,
}: {
  settings: BookingLinkSettings;
  depositRequired: boolean;
  services: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [welcomeText, setWelcomeText] = useState(settings.welcomeText ?? "");
  const [visibleServiceIds, setVisibleServiceIds] = useState<string[]>(settings.visibleServiceIds);
  const [brandColor, setBrandColor] = useState(settings.brandColor ?? "#0C4B3B");
  const [requireDeposit, setRequireDeposit] = useState(depositRequired);

  const mutation = useMutation({
    mutationFn: async () => {
      await updateBookingLinkSettings({ welcomeText: welcomeText || undefined, visibleServiceIds, brandColor });
      if (requireDeposit !== depositRequired) {
        await updateDepositSettings({ required: requireDeposit });
      }
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
    <Dialog
      open
      onClose={onClose}
      title="Customise your booking page"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Welcome text" value={welcomeText} onChange={(e) => setWelcomeText(e.target.value)} placeholder="Welcome! Book your appointment below." />
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-fg" htmlFor="brand-color">
            Brand colour
          </label>
          <input id="brand-color" type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded-[var(--radius-sm)] border border-border-strong" />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-fg">
          <input type="checkbox" checked={requireDeposit} onChange={(e) => setRequireDeposit(e.target.checked)} />
          Require a deposit to book
        </label>
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">Visible services (blank = every active service)</p>
          <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-fg">
                <input type="checkbox" checked={visibleServiceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
