"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Ban,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  FileBarChart,
  FileDown,
  Filter,
  Globe,
  GitCompare,
  GitFork,
  History,
  Info,
  KeyRound,
  Layers,
  LayoutGrid,
  MapPinned,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Moon,
  Package,
  Pause,
  Play,
  Plug,
  PlugZap,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Table2,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Unplug,
  UserRound,
  UsersRound,
  WalletCards,
  Webhook,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Chip, R, chipStyle, type Tone } from "@/components/reports/reports-ui";
import type { HubDirection, HubProvider, HubStatus } from "@/lib/integrations-hub-api";

export { Chip, R, chipStyle };
export type { Tone };

const ICONS: Record<string, LucideIcon> = {
  "arrow-down-left": ArrowDownLeft,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-right-left": ArrowRightLeft,
  "arrow-up-right": ArrowUpRight,
  ban: Ban,
  bell: Bell,
  "book-open": BookOpen,
  boxes: Boxes,
  "building-2": Building2,
  "calendar-check": CalendarCheck,
  "calendar-days": CalendarDays,
  check: Check,
  chrome: Globe,
  "chevron-right": ChevronRight,
  "chart-no-axes-combined": TrendingUp,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "circle-dashed": CircleDashed,
  "clock-3": Clock3,
  copy: Copy,
  "credit-card": CreditCard,
  "external-link": ExternalLink,
  "file-bar-chart": FileBarChart,
  "file-down": FileDown,
  filter: Filter,
  "git-compare": GitCompare,
  "git-fork": GitFork,
  globe: Globe,
  history: History,
  info: Info,
  "key-round": KeyRound,
  layers: Layers,
  "layout-grid": LayoutGrid,
  "map-pinned": MapPinned,
  megaphone: Megaphone,
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  "more-horizontal": MoreHorizontal,
  moon: Moon,
  package: Package,
  pause: Pause,
  play: Play,
  plug: Plug,
  "plug-zap": PlugZap,
  plus: Plus,
  "receipt-text": ReceiptText,
  "refresh-cw": RefreshCw,
  search: Search,
  send: Send,
  "share-2": Share2,
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  sparkles: Sparkles,
  star: Star,
  "table-2": Table2,
  target: Target,
  "trash-2": Trash2,
  "triangle-alert": TriangleAlert,
  unplug: Unplug,
  "user-round": UserRound,
  "users-round": UsersRound,
  "wallet-cards": WalletCards,
  webhook: Webhook,
  workflow: Workflow,
  x: X,
  zap: Zap,
};

export function HIcon({ name, size = 14, strokeWidth = 1.75, style }: { name: string; size?: number; strokeWidth?: number; style?: CSSProperties }) {
  const Cmp = ICONS[name] ?? Info;
  return <Cmp size={size} strokeWidth={strokeWidth} style={{ display: "block", flexShrink: 0, ...style }} aria-hidden />;
}

// ── status vocabulary ──────────────────────────────────────────────────────

export interface StatusMeta {
  label: string;
  icon: string;
  tone: Tone;
}

/** Status of a provider card → label/icon/tone. Attention reads red when authorisation itself is broken. */
export function statusMeta(p: Pick<HubProvider, "status" | "attention">): StatusMeta {
  const status: HubStatus = p.status;
  if (status === "connected") return { label: "Connected", icon: "circle-check", tone: "green" };
  if (status === "paused") return { label: "Paused", icon: "pause", tone: "neutral" };
  if (status === "needs_attention") {
    const authBroken = p.attention.some((a) => a.code === "auth_failed" || a.code === "auth_expired");
    return { label: "Needs attention", icon: authBroken ? "circle-alert" : "triangle-alert", tone: authBroken ? "red" : "amber" };
  }
  return { label: "Not connected", icon: "circle-dashed", tone: "neutral" };
}

export function isConnected(p: Pick<HubProvider, "status">): boolean {
  return p.status !== "not_connected";
}

export function dirIcon(direction: HubDirection | string): string {
  return direction === "Inbound" ? "arrow-down-left" : direction === "Outbound" ? "arrow-up-right" : "arrow-right-left";
}

const LOGO_TONES: Record<string, [string, string]> = {
  red: ["#FEE4E2", "#B42318"],
  amber: ["#FEF3C7", "#B45309"],
  green: ["#ECFDF3", "#15803D"],
  neutral: ["#F1F3F6", "#5B6675"],
};

export function LogoTile({ initials, tone, size = 38, radius = 10, fontSize = 12.5 }: { initials: string; tone: Tone; size?: number; radius?: number; fontSize?: number }) {
  const [bg, fg] = LOGO_TONES[tone] ?? LOGO_TONES.neutral;
  return (
    <div
      style={{ width: size, height: size, flex: `0 0 ${size}px`, borderRadius: radius, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize, fontWeight: 800 }}
    >
      {initials}
    </div>
  );
}

export function StatusChip({ meta, height = 21, fontSize = 10 }: { meta: StatusMeta; height?: number; fontSize?: number }) {
  return (
    <span style={chipStyle(meta.tone, { height, fontSize })}>
      <HIcon name={meta.icon} size={height > 22 ? 12 : 11} />
      <span>{meta.label}</span>
    </span>
  );
}

export function DirChip({ direction, tone = "neutral", height = 21, fontSize = 10, withIcon }: { direction: string; tone?: Tone; height?: number; fontSize?: number; withIcon?: boolean }) {
  return (
    <span style={chipStyle(tone, { height, fontSize })}>
      {withIcon ? <HIcon name={dirIcon(direction)} size={11} /> : null}
      <span>{direction}</span>
    </span>
  );
}

// ── buttons ────────────────────────────────────────────────────────────────

export const greenBtn: CSSProperties = {
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 10px",
  borderRadius: 8,
  background: R.green,
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  border: 0,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

export const ghostBtn: CSSProperties = {
  height: 30,
  display: "inline-flex",
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

/** The 34px action buttons above tables (Sync now / Retry / Export…). */
export function tableAction(primary: boolean, disabled?: boolean): CSSProperties {
  return {
    height: 34,
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    borderRadius: 10,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    background: primary ? R.green : "#fff",
    color: primary ? "#fff" : R.text,
    border: `1px solid ${primary ? R.green : R.btnBorder}`,
    opacity: disabled ? 0.55 : 1,
  };
}

// ── layout blocks ──────────────────────────────────────────────────────────

export const card: CSSProperties = { background: "#fff", border: `1px solid ${R.border}`, borderRadius: 13, boxShadow: R.shadow };

export function TableFootnote({ children }: { children: ReactNode }) {
  return <div style={{ padding: "12px 18px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", fontSize: 11, color: R.faint, lineHeight: 1.5 }}>{children}</div>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "26px 18px", textAlign: "center", fontSize: 12.5, color: R.muted }}>
        {children}
      </td>
    </tr>
  );
}

export function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div style={{ display: "flex", gap: 11, marginLeft: "auto", flexWrap: "wrap" }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: R.muted, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Stacked bars exactly as the design draws them: ok on the bottom, failure/online stacked above. */
export function StackedBars({
  data,
  gap = 7,
  okColor,
  topColor,
  onClick,
}: {
  data: Array<{ label: string; ok: number; top: number }>;
  gap?: number;
  okColor: string;
  topColor: string;
  onClick?: (index: number) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.ok + d.top));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height: 150, marginTop: 16 }}>
      {data.map((d, i) => (
        <div
          key={`${d.label}-${i}`}
          onClick={onClick ? () => onClick(i) : undefined}
          style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%", gap: 6, cursor: onClick ? "pointer" : "default" }}
        >
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 2, justifyContent: "flex-end", height: "100%" }}>
            {d.top > 0 ? <div style={{ height: `${(d.top / max) * 92}%`, minHeight: 3, background: topColor, borderRadius: "4px 4px 0 0" }} /> : null}
            {d.ok > 0 ? <div style={{ height: `${(d.ok / max) * 92}%`, minHeight: 3, background: okColor, borderRadius: d.top > 0 ? "0 0 4px 4px" : 4 }} /> : null}
          </div>
          <div style={{ fontSize: 9.5, color: R.faint }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const n = Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i / n) * 520},${132 - (v / max) * 114}`);
  return (
    <svg viewBox="0 0 520 150" preserveAspectRatio="none" style={{ width: "100%", height: 150, display: "block", marginTop: 16 }}>
      <line x1="0" y1="18" x2="520" y2="18" stroke="#EEF0F3" strokeWidth="1" />
      <line x1="0" y1="58" x2="520" y2="58" stroke="#EEF0F3" strokeWidth="1" />
      <line x1="0" y1="98" x2="520" y2="98" stroke="#EEF0F3" strokeWidth="1" />
      <line x1="0" y1="132" x2="520" y2="132" stroke="#E6E8EC" strokeWidth="1" />
      <polygon points={`${pts.join(" ")} 520,132 0,132`} fill="#16A34A" opacity="0.08" />
      <polyline points={pts.join(" ")} fill="none" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {values.length > 0 ? <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="4" fill="#16A34A" /> : null}
    </svg>
  );
}

// ── formatting ─────────────────────────────────────────────────────────────

export function whenLabel(iso: string | null | undefined, fallback = "Never"): string {
  if (!iso) return fallback;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return stamp(iso);
}

export function stamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function shortStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function timeStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString("en-US")}`;
  }
}

/** "1 message", "18 transactions", "14 days of traffic" — the unit's first word agrees with the count. */
/** "inbox items" → "inbox item", "days of traffic" → "day of traffic": the first plural word loses its s. */
function singularUnit(unit: string): string {
  const words = unit.split(" ");
  const i = words.findIndex((w) => /[^s]s$/.test(w));
  if (i >= 0) words[i] = words[i].slice(0, -1);
  return words.join(" ");
}

export function recordsLabel(p: Pick<HubProvider, "records" | "recordsUnit">): string | null {
  if (p.records === null) return null;
  const unit = p.records === 1 ? singularUnit(p.recordsUnit) : p.recordsUnit;
  return `${p.records.toLocaleString("en-US")} ${unit}`;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
