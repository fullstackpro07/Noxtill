"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  BadgeCheck,
  Boxes,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  CreditCard,
  Database,
  Download,
  Eye,
  FileBarChart,
  FileDown,
  FileText,
  Filter,
  History,
  Info,
  Lightbulb,
  Mail,
  Megaphone,
  MessageCircle,
  Package,
  Plus,
  Printer,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  TrendingUp,
  TriangleAlert,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";

/** Exact literals from the Reports design (Noxtill Reports.dc.html). Kept local to this module. */
export const R = {
  page: "#F5F6F8",
  card: "#fff",
  border: "#E6E8EC",
  divider: "#EEF0F3",
  rowLine: "#F3F4F7",
  ink: "#0F172A",
  text: "#45505F",
  muted: "#5B6675",
  faint: "#94A3B8",
  label: "#7A8798",
  navy: "#0C1727",
  green: "#16A34A",
  greenHover: "#15803D",
  greenSoft: "#ECFDF3",
  greenLine: "#BBF0CB",
  btnBorder: "#D5DAE2",
  shadow: "0 1px 2px rgba(16,24,40,.05)",
};

/** The real hour the daily schedule job runs (server time). */
export const SCHEDULE_RUN_HOUR = 6;

export type Tone = "green" | "amber" | "red" | "blue" | "purple" | "neutral";

const CHIP_TONES: Record<Tone, [string, string, string]> = {
  green: ["#ECFDF3", "#BBF0CB", "#15803D"],
  amber: ["#FFFBEB", "#FDE49B", "#B45309"],
  red: ["#FEF3F2", "#FBD5D2", "#B42318"],
  blue: ["#EFF6FF", "#C7DBFE", "#1D4ED8"],
  purple: ["#F5F3FF", "#DDD3FE", "#6D28D9"],
  neutral: ["#F1F3F6", "#E1E5EB", "#45505F"],
};

export function chipStyle(tone: Tone, extra?: CSSProperties): CSSProperties {
  const [bg, border, color] = CHIP_TONES[tone] ?? CHIP_TONES.neutral;
  return {
    height: 23,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "0 8px",
    borderRadius: 999,
    background: bg,
    border: `1px solid ${border}`,
    color,
    fontSize: 10.5,
    fontWeight: 700,
    whiteSpace: "nowrap",
    ...extra,
  };
}

export function Chip({ tone, children, style }: { tone: Tone; children: ReactNode; style?: CSSProperties }) {
  return <span style={chipStyle(tone, style)}>{children}</span>;
}

export const filterBtnStyle: CSSProperties = {
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 11px",
  borderRadius: 10,
  border: `1px solid ${R.btnBorder}`,
  background: "#fff",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  color: R.ink,
};

export const smallBtnStyle: CSSProperties = {
  height: 30,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${R.btnBorder}`,
  background: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
  color: R.ink,
};

export const primaryBtnStyle: CSSProperties = {
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 12px",
  borderRadius: 10,
  background: R.green,
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
  border: 0,
  whiteSpace: "nowrap",
};

export function thStyle(align: "left" | "center" | "right" = "left"): CSSProperties {
  return {
    textAlign: align,
    padding: "11px 12px",
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: ".07em",
    textTransform: "uppercase",
    color: R.label,
    whiteSpace: "nowrap",
  };
}

export function kpiCardStyle(tone: "red" | "amber" | "neutral" | "blue" | "green" = "neutral"): CSSProperties {
  return {
    background: "#fff",
    borderRadius: 12,
    padding: "14px 15px",
    boxShadow: "0 1px 2px rgba(16,24,40,.04)",
    border: `1px solid ${tone === "red" ? "#FBD5D2" : tone === "amber" ? "#FDE49B" : R.border}`,
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
    color: "inherit",
  };
}

export function kpiValueStyle(tone: "red" | "amber" | "neutral" | "blue" | "green" = "neutral", long = false): CSSProperties {
  return {
    fontSize: long ? 15 : 19,
    fontWeight: 800,
    letterSpacing: "-.03em",
    marginTop: 7,
    fontVariantNumeric: "tabular-nums",
    color: tone === "red" ? "#B42318" : tone === "amber" ? "#B45309" : R.ink,
  };
}

export function Kpi({
  label,
  value,
  meta,
  tone = "neutral",
  onClick,
  compact,
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: "red" | "amber" | "neutral";
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} style={{ ...kpiCardStyle(tone), cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: R.muted }}>{label}</div>
      <div style={kpiValueStyle(tone, compact ?? value.length > 10)}>{value}</div>
      {meta ? <div style={{ fontSize: 10.5, color: R.faint, marginTop: 3 }}>{meta}</div> : null}
    </button>
  );
}

export function KpiGrid({ min = 160, children }: { min?: number; children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>;
}

export function KpiSkeletons({ count, min = 160 }: { count: number; min?: number }) {
  return (
    <KpiGrid min={min}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ ...kpiCardStyle(), cursor: "default" }}>
          <div style={{ height: 10, width: "55%", borderRadius: 6, background: "#F1F3F6" }} />
          <div style={{ height: 20, width: "70%", borderRadius: 7, marginTop: 11, background: "#F1F3F6" }} />
          <div style={{ height: 9, width: "45%", borderRadius: 5, marginTop: 9, background: "#F1F3F6" }} />
        </div>
      ))}
    </KpiGrid>
  );
}

export const cardShellStyle: CSSProperties = {
  background: "#fff",
  border: `1px solid ${R.border}`,
  borderRadius: 13,
  boxShadow: R.shadow,
};

const ICONS: Record<string, LucideIcon> = {
  "badge-check": BadgeCheck,
  boxes: Boxes,
  "building-2": Building2,
  calendar: Calendar,
  "calendar-clock": CalendarClock,
  "calendar-days": CalendarDays,
  check: Check,
  "chevron-down": ChevronDown,
  "chart-no-axes-combined": TrendingUp,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "clock-3": Clock3,
  "credit-card": CreditCard,
  database: Database,
  download: Download,
  eye: Eye,
  "file-bar-chart": FileBarChart,
  "file-down": FileDown,
  "file-text": FileText,
  filter: Filter,
  history: History,
  info: Info,
  lightbulb: Lightbulb,
  mail: Mail,
  megaphone: Megaphone,
  "message-circle": MessageCircle,
  package: Package,
  plus: Plus,
  printer: Printer,
  "receipt-text": Receipt,
  search: Search,
  send: Send,
  "shield-check": ShieldCheck,
  "shopping-cart": ShoppingCart,
  sparkles: Sparkles,
  star: Star,
  "triangle-alert": TriangleAlert,
  "users-round": UsersRound,
  x: X,
};

export function RIcon({ name, size = 14, strokeWidth = 1.75, style }: { name: string; size?: number; strokeWidth?: number; style?: CSSProperties }) {
  const Cmp = ICONS[name] ?? FileText;
  return <Cmp size={size} strokeWidth={strokeWidth} style={{ display: "block", flexShrink: 0, ...style }} aria-hidden />;
}

// ---------------------------------------------------------------- formatting

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-08" -> "August 2026". */
export function monthName(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The label for the period pill: "This month", "Last month", else "June 2026". */
export function periodPillLabel(period: string): string {
  const now = currentPeriod();
  if (period === now) return "This month";
  if (period === shiftPeriod(now, -1)) return "Last month";
  return monthName(period);
}

function timeOfDay(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today 6:00 AM" / "Yesterday 10:02 PM" / "Tomorrow 6:00 AM" / "12 August 9:00 AM". */
export function relativeDateTime(iso: string | null | undefined, opts?: { withTime?: boolean }): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const withTime = opts?.withTime ?? true;
  const dayDiff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  const day =
    dayDiff === 0 ? "Today" : dayDiff === -1 ? "Yesterday" : dayDiff === 1 ? "Tomorrow" : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withTime ? `${day} ${timeOfDay(d)}` : day;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "4 min ago" style, from a timestamp. */
export function ageLabel(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("en-US")}`;
  }
}

export function formatMoney2(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${hour < 12 ? "AM" : "PM"}`;
}

export function validationTone(v: string | null | undefined): Tone {
  return v === "reconciled" ? "green" : v === "warning" ? "amber" : v === "critical" ? "red" : "neutral";
}

export function validationLabel(v: string | null | undefined): string {
  return v === "reconciled" ? "Reconciled" : v === "warning" ? "Warning" : v === "critical" ? "Critical" : "—";
}

export function validationIcon(v: string | null | undefined): string {
  return v === "reconciled" ? "badge-check" : v === "warning" ? "triangle-alert" : "circle-alert";
}

// ---------------------------------------------------------------- shared blocks

export function PanelRows({ rows, dense }: { rows: { label: string; value: ReactNode; tone?: "pos" | "neg" | "neutral"; onClick?: () => void }[]; dense?: boolean }) {
  return (
    <>
      {rows.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          onClick={r.onClick}
          style={{
            display: "flex",
            alignItems: dense ? "center" : "flex-start",
            gap: 12,
            padding: dense ? "10px 13px" : "11px 13px",
            borderTop: i === 0 ? "none" : `1px solid ${R.divider}`,
            background: i % 2 ? "#FCFCFD" : "#fff",
            cursor: r.onClick ? "pointer" : "default",
          }}
        >
          <div style={{ fontSize: 12, color: R.muted, fontWeight: 600, flex: "0 0 45%" }}>{r.label}</div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              textAlign: "right",
              flex: 1,
              textWrap: "pretty",
              fontVariantNumeric: "tabular-nums",
              color: r.tone === "neg" ? "#B42318" : r.tone === "pos" ? "#15803D" : R.ink,
              wordBreak: "break-word",
            }}
          >
            {r.value}
          </div>
        </div>
      ))}
    </>
  );
}

export function BulletList({ title, bullets }: { title: string; bullets: string[] }) {
  if (bullets.length === 0) return null;
  return (
    <div style={{ flex: "0 0 auto" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: R.faint, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {bullets.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: R.green, marginTop: 6, flex: "0 0 6px" }} />
            <div style={{ fontSize: 12.5, color: R.text, lineHeight: 1.55, textWrap: "pretty" }}>{b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NoteBox({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, background: "#FCFCFD", borderRadius: 12, padding: 13, display: "flex", gap: 9 }}>
      <Info size={15} style={{ flex: "0 0 15px", color: R.label, marginTop: 1 }} aria-hidden />
      <div style={{ fontSize: 11.5, color: R.muted, lineHeight: 1.55, textWrap: "pretty" }}>{children}</div>
    </div>
  );
}

export function BannerCard({
  tone,
  icon,
  title,
  text,
  children,
}: {
  tone: "purple" | "red" | "amber";
  icon: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  const border = tone === "purple" ? "#DDD3FE" : tone === "red" ? "#FBD5D2" : "#FDE49B";
  const bg = tone === "purple" ? "#F5F3FF" : tone === "red" ? "#FEF3F2" : "#FFFBEB";
  const fg = tone === "purple" ? "#6D28D9" : tone === "red" ? "#B42318" : "#B45309";
  return (
    <div style={{ ...cardShellStyle, borderColor: border, borderRadius: tone === "purple" ? 13 : 12, padding: tone === "purple" ? "16px 18px" : "15px 17px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ width: 30, height: 30, flex: "0 0 30px", borderRadius: 9, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <RIcon name={icon} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: R.muted, marginTop: 3, textWrap: "pretty" }}>{text}</div>
      </div>
      {children}
    </div>
  );
}

export function CardEmpty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div style={{ ...cardShellStyle, padding: "44px 20px", textAlign: "center" }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F1F3F6", color: R.label, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <RIcon name={icon} size={19} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 12, color: R.muted, marginTop: 5, maxWidth: "56ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ ...cardShellStyle, borderColor: "#FBD5D2", padding: "18px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <RIcon name="circle-alert" size={16} style={{ color: "#B42318" }} />
      <div style={{ flex: 1, fontSize: 12.5, color: "#B42318", fontWeight: 600 }}>{message}</div>
      {onRetry ? (
        <button type="button" onClick={onRetry} style={smallBtnStyle}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export const inputStyle: CSSProperties = {
  height: 40,
  width: "100%",
  padding: "0 12px",
  border: `1px solid ${R.btnBorder}`,
  borderRadius: 10,
  background: "#fff",
  fontSize: 12.5,
  color: R.ink,
  outline: "none",
};

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, color: R.text, marginBottom: 6 }}>{children}</div>;
}
