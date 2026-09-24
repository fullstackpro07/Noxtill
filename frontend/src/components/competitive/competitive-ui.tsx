"use client";

import type { CSSProperties, ReactNode } from "react";
import { chip } from "@/lib/competitive-insights";

/* Shared building blocks mirroring the inline styles in `Noxtill Competitive.dc.html`. */

export function Card({
  children,
  className = "",
  border = "#E6EAF0",
  thick = false,
  overflow = false,
  pad = false,
}: {
  children: ReactNode;
  className?: string;
  border?: string;
  thick?: boolean;
  overflow?: boolean;
  pad?: boolean | number;
}) {
  return (
    <div
      className={`rounded-[16px] bg-white ${overflow ? "overflow-hidden" : ""} ${className}`}
      style={{
        border: `${thick ? "1.5px" : "1px"} solid ${border}`,
        padding: pad === true ? 17 : pad === false ? undefined : pad,
      }}
    >
      {children}
    </div>
  );
}

export function CardHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#F0F2F5] px-[17px] py-[13px]">
      <h3 className="m-0 text-[14.5px] font-extrabold text-[#101828]">{title}</h3>
      {sub ? <span className="text-[11px] text-[#98A2B3]">{sub}</span> : null}
      {right ? <span className="ml-auto">{right}</span> : null}
    </div>
  );
}

export function Chip({
  tone,
  children,
  radius = 20,
  className = "",
  style,
}: {
  tone: string;
  children: ReactNode;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const c = chip(tone);
  return (
    <span
      className={`whitespace-nowrap font-extrabold ${className}`}
      style={{ background: c.bg, color: c.fg, borderRadius: radius, ...style }}
    >
      {children}
    </span>
  );
}

/** The blue "everything here comes from public pages" strip. */
export function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] border border-[#C7D7FE] bg-[#EEF4FF] px-3.5 py-3">
      <svg className="mt-px flex-none" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3538CD" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4M12 8.5h.01" />
      </svg>
      <div className="text-[12px] leading-[1.55] text-[#3538CD]">{children}</div>
    </div>
  );
}

/** The amber caveat box used under simulators and content notes. */
export function AmberNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[11px] border border-[#FDE3B3] bg-[#FFFBF2] p-3 text-[11.5px] leading-[1.6] text-[#93370D] ${className}`}>{children}</div>
  );
}

export const th = "text-[11px] font-bold text-[#98A2B3] py-2.5";

export function Th({ children, align = "left", edge = false }: { children: ReactNode; align?: "left" | "right"; edge?: boolean }) {
  return (
    <th className={`${th} ${align === "right" ? "text-right" : "text-left"} ${edge ? "px-[17px]" : "px-2.5"}`}>{children}</th>
  );
}

export function TableCard({ minWidth, head, children }: { minWidth: number; head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead>
          <tr className="bg-[#FAFBFC]">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  return <div className="border-t border-[#F0F2F5] px-[17px] py-[11px] text-[11.5px] text-[#98A2B3]">{children}</div>;
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = "",
  big = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  big?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer border-0 bg-[#12A150] font-extrabold text-white transition-colors hover:bg-[#0E8442] disabled:cursor-not-allowed disabled:opacity-60 ${
        big ? "min-h-[46px] rounded-[12px] px-[22px] py-3 text-[13px]" : "min-h-[44px] rounded-[10px] px-4 py-2.5 text-[12px]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className = "",
  tone = "green",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  tone?: "green" | "grey";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[44px] cursor-pointer rounded-[10px] border border-[#E6EAF0] bg-white px-3.5 py-2.5 text-[12px] font-bold transition-colors hover:border-[#12A150] disabled:cursor-not-allowed disabled:opacity-60 ${
        tone === "green" ? "text-[#0E8442] hover:bg-[#F7FCF9]" : "text-[#344054] hover:text-[#0E8442]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function EmptyCard({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-[16px] border border-[#E6EAF0] bg-white px-[18px] py-[52px] text-center">
      <div className="text-[14.5px] font-extrabold text-[#344054]">{title}</div>
      {body ? <div className="mx-auto mt-[5px] max-w-[60ch] text-[12.5px] text-[#98A2B3]">{body}</div> : null}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 min-h-[46px] cursor-pointer rounded-[12px] border-0 bg-[#12A150] px-[22px] py-3 text-[13px] font-extrabold text-white transition-colors hover:bg-[#0E8442]"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonBlock({ h = 120 }: { h?: number }) {
  return <div className="animate-pulse rounded-[16px] border border-[#E6EAF0] bg-[#F4F6F8]" style={{ height: h }} />;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative h-[22px] w-10 flex-none cursor-pointer rounded-[20px] border-0"
      style={{ background: on ? "#12A150" : "#D0D5DD" }}
    >
      <span className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ [on ? "right" : "left"]: 2 }} />
    </button>
  );
}

export const selectClass =
  "min-h-[44px] rounded-[11px] border border-[#E6EAF0] bg-white px-3 py-2.5 text-[12.5px] font-semibold text-[#344054]";
