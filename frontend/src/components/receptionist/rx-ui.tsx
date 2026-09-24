"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ChipSpec, Tone } from "@/lib/receptionist-derive";
import { Ico } from "./rx-icon";

/* Building blocks that mirror the inline styles in `Noxtill AI Phone.dc.html`. */

export const TONE: Record<Tone, { bg: string; border: string; fg: string }> = {
  green: { bg: "#ECFDF3", border: "#BBF0CB", fg: "#15803D" },
  amber: { bg: "#FFFBEB", border: "#FDE49B", fg: "#B45309" },
  red: { bg: "#FEF3F2", border: "#FBD5D2", fg: "#B42318" },
  blue: { bg: "#EFF6FF", border: "#C7DBFE", fg: "#1D4ED8" },
  purple: { bg: "#F5F3FF", border: "#DDD3FE", fg: "#6D28D9" },
  neutral: { bg: "#F1F3F6", border: "#E1E5EB", fg: "#45505F" },
};

/** The design's pill chip. `h` is 23 (default) or 21/22 for the smaller table variant. */
export function Chip({
  tone,
  children,
  h = 21,
  fontSize = 10,
  icon,
  className = "",
  style,
}: {
  tone: Tone;
  children: ReactNode;
  h?: number;
  fontSize?: number;
  icon?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-full border px-2 font-bold ${className}`}
      style={{ height: h, background: t.bg, borderColor: t.border, color: t.fg, fontSize, ...style }}
    >
      {icon ? <Ico name={icon} size={11} /> : null}
      {children}
    </span>
  );
}

export function ChipFor({ spec, h = 21, fontSize = 10 }: { spec: ChipSpec; h?: number; fontSize?: number }) {
  return (
    <Chip tone={spec.tone} h={h} fontSize={fontSize} icon={spec.icon}>
      {spec.label}
    </Chip>
  );
}

export function Card({ children, className = "", border = "#E6E8EC", overflow = false, pad }: { children: ReactNode; className?: string; border?: string; overflow?: boolean; pad?: number }) {
  return (
    <div
      className={`min-w-0 rounded-[13px] bg-white ${overflow ? "overflow-hidden" : ""} ${className}`}
      style={{ border: `1px solid ${border}`, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: pad }}
    >
      {children}
    </div>
  );
}

export function CardHead({ icon, iconColor, title, right, sub }: { icon?: string; iconColor?: string; title: string; right?: ReactNode; sub?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-[9px] border-b border-[#EEF0F3] px-[18px] py-3.5">
      {icon ? <Ico name={icon} size={15} style={{ color: iconColor ?? "#45505F" }} /> : null}
      <div className="text-[13.5px] font-extrabold">{title}</div>
      {sub ? <div className="text-[11px] text-[#94A3B8]">{sub}</div> : null}
      {right ? <div className="ml-auto">{right}</div> : null}
    </div>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  return <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] px-[18px] py-3 text-[11px] text-[#94A3B8]">{children}</div>;
}

export function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
  subColor,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "green" | "amber" | "red";
  subColor?: string;
  onClick?: () => void;
}) {
  const border = tone === "red" ? "#FBD5D2" : tone === "amber" ? "#FDE49B" : "#E6E8EC";
  const color = tone === "red" ? "#B42318" : tone === "amber" ? "#B45309" : "#0F172A";
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-[12px] bg-white px-[15px] py-3.5 transition-colors hover:border-[#CBD5E1]!"
      style={{ border: `1px solid ${border}`, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}
    >
      <div className="text-[11.5px] font-bold text-[#5B6675]">{label}</div>
      <div className="mt-[7px] text-[19px] font-extrabold tabular-nums tracking-[-.03em]" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[10.5px]" style={{ color: subColor ?? "#94A3B8", fontWeight: subColor ? 700 : 400 }}>
        {sub}
      </div>
    </div>
  );
}

export const kpiGrid = (min: number) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }) as const;

export function Th({ children, align = "left" }: { children?: ReactNode; align?: "left" | "center" | "right" }) {
  return (
    <th className="whitespace-nowrap px-3 py-[11px] text-[10.5px] font-extrabold uppercase tracking-[.07em] text-[#7A8798]" style={{ textAlign: align }}>
      {children}
    </th>
  );
}

export function TableWrap({ minWidth, head, children }: { minWidth: number; head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-[#E6E8EC] bg-[#FAFBFC]">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function SmallBtn({ children, onClick, icon, disabled, className = "", title }: { children: ReactNode; onClick?: () => void; icon?: string; disabled?: boolean; className?: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-[30px] flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold transition-colors hover:bg-[#F1F3F6] disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
    >
      {icon ? <Ico name={icon} size={13} /> : null}
      {children}
    </button>
  );
}

export function PrimaryBtn({ children, onClick, disabled, height = 32, className = "" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; height?: number; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[9px] border-0 bg-[#16A34A] px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      style={{ height }}
    >
      {children}
    </button>
  );
}

/** A compact green action used in table rows (Call back / Review / Assign). */
export function RowAction({ children, onClick, primary }: { children: ReactNode; onClick: (e: React.MouseEvent) => void; primary?: boolean }) {
  return primary ? (
    <button type="button" onClick={onClick} className="inline-flex h-[30px] cursor-pointer items-center rounded-[8px] border-0 bg-[#16A34A] px-2.5 text-[12px] font-bold text-white hover:bg-[#15803D]">
      {children}
    </button>
  ) : (
    <button type="button" onClick={onClick} className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold hover:bg-[#F1F3F6]">
      {children}
    </button>
  );
}

/** Amber / green / grey info strip used above tables. */
export function Notice({ tone, icon, children, action }: { tone: "amber" | "green" | "neutral"; icon: string; children: ReactNode; action?: ReactNode }) {
  const border = tone === "amber" ? "#FDE49B" : tone === "green" ? "#BBF0CB" : "#E6E8EC";
  const iconColor = tone === "amber" ? "#B45309" : tone === "green" ? "#15803D" : "#7A8798";
  const textColor = tone === "amber" ? "#B45309" : tone === "green" ? "#45505F" : "#5B6675";
  return (
    <div className="flex flex-wrap items-center gap-[11px] rounded-[12px] bg-white px-4 py-3.5" style={{ border: `1px solid ${border}`, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <Ico name={icon} size={15} style={{ color: iconColor }} />
      <div className="min-w-[220px] flex-1 text-[11.5px] leading-[1.5]" style={{ color: textColor }}>
        {children}
      </div>
      {action}
    </div>
  );
}

export function BarRow({ label, value, sub, widthPct, color, onClick }: { label: string; value: string; sub?: string; widthPct: number; color: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className="cursor-pointer">
      <div className="mb-[5px] flex flex-wrap items-baseline gap-2 text-[12px]">
        <span className="font-bold">{label}</span>
        {sub ? <span className="text-[#94A3B8]">{sub}</span> : null}
        <span className="ml-auto font-extrabold tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-[5px] bg-[#F1F3F6]">
        <div className="h-full rounded-[5px]" style={{ width: `${Math.max(2, widthPct)}%`, background: color }} />
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#F1F3F6] text-[#7A8798]">
        <Ico name={icon} size={18} />
      </div>
      <div className="text-[13px] font-extrabold">{title}</div>
      <div className="mt-1 max-w-[52ch] text-[11.5px] leading-[1.55] text-[#94A3B8]">{body}</div>
    </div>
  );
}

export function SkeletonBlock({ h = 120 }: { h?: number }) {
  return <div className="animate-pulse rounded-[13px] border border-[#E6E8EC] bg-[#F1F3F6]" style={{ height: h }} />;
}
