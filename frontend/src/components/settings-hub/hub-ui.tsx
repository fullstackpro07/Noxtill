"use client";

import type { CSSProperties } from "react";
import {
  Accessibility,
  Activity,
  BadgeCheck,
  Bell,
  Building,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CreditCard,
  Database,
  ExternalLink,
  FileBarChart,
  FileDown,
  FileUp,
  HardDriveDownload,
  History,
  Info,
  Boxes,
  KeyRound,
  Keyboard,
  Languages,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Megaphone,
  MessageCircle,
  MonitorSmartphone,
  Palette,
  PlugZap,
  Receipt,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  TriangleAlert,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
  WalletCards,
  Workflow,
  X,
  Pin,
  type LucideIcon,
} from "lucide-react";
import { R, chipStyle, type Tone } from "@/components/reports/reports-ui";

export { R, chipStyle, type Tone };

const ICONS: Record<string, LucideIcon> = {
  accessibility: Accessibility,
  activity: Activity,
  "badge-check": BadgeCheck,
  bell: Bell,
  boxes: Boxes,
  building: Building,
  "building-2": Building2,
  "calendar-check": CalendarCheck,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "circle-help": CircleHelp,
  "credit-card": CreditCard,
  database: Database,
  "external-link": ExternalLink,
  "file-bar-chart": FileBarChart,
  "file-down": FileDown,
  "file-up": FileUp,
  "hard-drive-download": HardDriveDownload,
  history: History,
  info: Info,
  "key-round": KeyRound,
  keyboard: Keyboard,
  languages: Languages,
  "loader-circle": LoaderCircle,
  "lock-keyhole": LockKeyhole,
  mail: Mail,
  megaphone: Megaphone,
  "message-circle": MessageCircle,
  "monitor-smartphone": MonitorSmartphone,
  palette: Palette,
  pin: Pin,
  "plug-zap": PlugZap,
  receipt: Receipt,
  "receipt-text": ReceiptText,
  "rotate-ccw": RotateCcw,
  save: Save,
  search: Search,
  shield: Shield,
  "shield-check": ShieldCheck,
  "shopping-cart": ShoppingCart,
  "sliders-horizontal": SlidersHorizontal,
  sparkles: Sparkles,
  star: Star,
  "triangle-alert": TriangleAlert,
  "user-round": UserRound,
  "users-round": UsersRound,
  "volume-2": Volume2,
  "volume-x": VolumeX,
  "wallet-cards": WalletCards,
  workflow: Workflow,
  x: X,
};

export function HIcon({ name, size = 14, strokeWidth = 1.75, style }: { name: string; size?: number; strokeWidth?: number; style?: CSSProperties }) {
  const Cmp = ICONS[name] ?? Info;
  return <Cmp size={size} strokeWidth={strokeWidth} style={{ display: "block", flexShrink: 0, ...style }} aria-hidden />;
}

export const smallBtn: CSSProperties = {
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

export function actionBtn(primary: boolean): CSSProperties {
  return {
    height: 34,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 12px",
    borderRadius: 10,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    background: primary ? R.green : "#fff",
    color: primary ? "#fff" : R.text,
    border: `1px solid ${primary ? R.green : R.btnBorder}`,
  };
}

export const cardBox: CSSProperties = {
  background: "#fff",
  border: `1px solid ${R.border}`,
  borderRadius: 13,
  boxShadow: R.shadow,
  overflow: "hidden",
};

export function Toggle({ on, onClick, disabled, size = "sm", label }: { on: boolean; onClick: () => void; disabled?: boolean; size?: "sm" | "lg"; label: string }) {
  const w = size === "lg" ? 40 : 38;
  const h = size === "lg" ? 23 : 22;
  const k = size === "lg" ? 19 : 18;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ width: w, height: h, borderRadius: 999, flexShrink: 0, cursor: disabled ? "not-allowed" : "pointer", background: on ? R.green : "#D5DAE2", display: "flex", alignItems: "center", padding: 2, justifyContent: on ? "flex-end" : "flex-start", transition: "background 140ms", border: 0, opacity: disabled ? 0.55 : 1 }}
    >
      <div style={{ width: k, height: k, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(16,24,40,.2)" }} />
    </button>
  );
}
