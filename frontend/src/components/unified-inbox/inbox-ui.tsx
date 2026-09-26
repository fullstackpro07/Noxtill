"use client";

import type { CSSProperties, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import type { Tone } from "@/lib/inbox-api";

/** Channel chip colours from the design (`chMeta`), neutral for anything else. */
export const CHANNEL_META: Record<string, { bg: string; fg: string; icon: string; label: string }> = {
  whatsapp: { bg: "#E8F7EE", fg: "#0E8442", icon: "whatsapp", label: "WhatsApp" },
  instagram: { bg: "#FDF2F8", fg: "#BE185D", icon: "instagram", label: "Instagram" },
  facebook: { bg: "#EEF4FF", fg: "#3538CD", icon: "facebook", label: "Facebook" },
  email: { bg: "#F2F4F7", fg: "#475467", icon: "email", label: "Email" },
  sms: { bg: "#FEF6E7", fg: "#B54708", icon: "sms", label: "SMS" },
  telegram: { bg: "#E8F1FB", fg: "#229ED9", icon: "telegram", label: "Telegram" },
  twitter: { bg: "#F2F4F7", fg: "#101828", icon: "x", label: "X" },
  linkedin: { bg: "#EEF4FF", fg: "#0A66C2", icon: "linkedin", label: "LinkedIn" },
  tiktok: { bg: "#F2F4F7", fg: "#101828", icon: "tiktok", label: "TikTok" },
  discord: { bg: "#EEF0FE", fg: "#5865F2", icon: "discord", label: "Discord" },
  pinterest: { bg: "#FEF3F2", fg: "#BD081C", icon: "pinterest", label: "Pinterest" },
  snapchat: { bg: "#FEF6E7", fg: "#B54708", icon: "snapchat", label: "Snapchat" },
};

export function channelMeta(key: string) {
  return CHANNEL_META[key] ?? { bg: "#F2F4F7", fg: "#475467", icon: "", label: key.charAt(0).toUpperCase() + key.slice(1) };
}

export const TONE: Record<Tone, { bg: string; bd: string; fg: string }> = {
  green: { bg: "#F7FCF9", bd: "#D5EFE0", fg: "#0E8442" },
  red: { bg: "#FEF3F2", bd: "#FDD9D6", fg: "#912018" },
  amber: { bg: "#FEF6E7", bd: "#FDE3B3", fg: "#93370D" },
  blue: { bg: "#EEF4FF", bd: "#C7D7FE", fg: "#3538CD" },
  neutral: { bg: "#FAFBFC", bd: "#F0F2F5", fg: "#475467" },
};

export const CHIP: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: "#E8F7EE", fg: "#0E8442" },
  red: { bg: "#FEF3F2", fg: "#B42318" },
  amber: { bg: "#FEF6E7", fg: "#B54708" },
  blue: { bg: "#EEF4FF", fg: "#3538CD" },
  neutral: { bg: "#F2F4F7", fg: "#475467" },
};

export const card: CSSProperties = { background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px" };
export const eyebrow: CSSProperties = { fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" };

export function ChannelLogo({ channel, size = 12, radius = 2 }: { channel: string; size?: number; radius?: number }) {
  const m = channelMeta(channel);
  if (!m.icon) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/inbox-icons/${m.icon}.png`} alt="" style={{ width: size, height: size, borderRadius: radius, objectFit: "contain", flex: `0 0 ${size}px` }} />;
}

export function ChannelChip({ channel, big = false, withLogo = true }: { channel: string; big?: boolean; withLogo?: boolean }) {
  const m = channelMeta(channel);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: big ? "5px" : "4px", fontSize: "9.5px", fontWeight: 700, color: m.fg, background: m.bg, borderRadius: "5px", padding: big ? "3px 7px" : "2px 6px", whiteSpace: "nowrap" }}>
      {withLogo && <ChannelLogo channel={channel} />}
      {m.label}
    </span>
  );
}

export function Avatar({ init, size = 32, font = 11 }: { init: string; size?: number; font?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: "#0A1B2A", color: "#fff", fontSize: font, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: `0 0 ${size}px` }}>{init}</span>
  );
}

export function Icon({ d, size = 15, stroke = "currentColor", width = 2 }: { d: string; size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Toggle({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <span style={{ width: "34px", height: "20px", borderRadius: "20px", background: on ? "#12A150" : "#D0D5DD", position: "relative", flex: "0 0 auto", marginTop: "1px", opacity: disabled ? 0.6 : 1 }}>
      <span style={{ position: "absolute", top: "2px", left: on ? "16px" : "2px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left .15s ease" }} />
    </span>
  );
}

export function ToggleRow({ l, d, on, locked, onToggle }: { l: string; d: string; on: boolean; locked?: boolean; onToggle?: () => void }) {
  const clickable = !locked && !!onToggle;
  return (
    <button
      type="button"
      onClick={clickable ? onToggle : undefined}
      disabled={!clickable}
      className="nx-hover-soft"
      style={{ display: "flex", alignItems: "flex-start", gap: "10px", width: "100%", textAlign: "left", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "12px", padding: "11px 12px", cursor: clickable ? "pointer" : "default", minHeight: "46px" }}
    >
      <Toggle on={on} disabled={!clickable} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#101828" }}>{l}</span>
        <span style={{ display: "block", fontSize: "10.5px", color: "#98A2B3", marginTop: "3px", lineHeight: 1.45 }}>{d}</span>
      </span>
    </button>
  );
}

export function PrimaryButton({ children, onClick, disabled, style, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; style?: CSSProperties; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="nx-primary"
      style={{ border: 0, background: "#12A150", borderRadius: "11px", padding: "11px 18px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: disabled ? "not-allowed" : "pointer", minHeight: "44px", opacity: disabled ? 0.55 : 1, ...style }}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled, style, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; style?: CSSProperties; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="nx-hover-soft"
      style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 13px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: disabled ? "not-allowed" : "pointer", minHeight: "40px", opacity: disabled ? 0.55 : 1, whiteSpace: "nowrap", ...style }}
    >
      {children}
    </button>
  );
}

export function EmptyBlock({ title, sub, icon = "m5 13 4 4L19 7" }: { title: string; sub?: string; icon?: string }) {
  return (
    <div style={{ padding: "50px 18px", textAlign: "center" }}>
      <div style={{ width: "44px", height: "44px", borderRadius: "13px", background: "#E8F7EE", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "11px" }}>
        <Icon d={icon} size={21} stroke="#0E8442" width={2.2} />
      </div>
      <div style={{ fontSize: "14px", fontWeight: 800, color: "#344054" }}>{title}</div>
      {sub && <div style={{ fontSize: "12px", color: "#98A2B3", marginTop: "4px", maxWidth: "52ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div style={{ padding: "44px 18px", textAlign: "center", fontSize: "12.5px", color: "#98A2B3" }}>{label}</div>;
}

export function InfoBanner({ children, tone = "blue", icon = "info" }: { children: ReactNode; tone?: "blue" | "amber" | "red"; icon?: "info" | "warn" }) {
  const t = tone === "blue" ? { bg: "#EEF4FF", bd: "#C7D7FE", fg: "#3538CD", tx: "#3538CD" } : tone === "amber" ? { bg: "#FFFBF2", bd: "#FDE3B3", fg: "#B54708", tx: "#93370D" } : { bg: "#FEF3F2", bd: "#FDD9D6", fg: "#B42318", tx: "#912018" };
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.fg} strokeWidth={2} strokeLinecap="round" style={{ flex: "0 0 auto", marginTop: "1px" }}>
        {icon === "info" ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-4M12 8.5h.01" />
          </>
        ) : (
          <path d="M12 9v5M12 17.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        )}
      </svg>
      <div style={{ fontSize: "12px", color: t.tx, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

/** Everything an inbox mutation can affect — refetch it all so every screen agrees. */
export function useInboxInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("inbox") });
}

export function relTime(iso: string, now = Date.now()): string {
  const d = new Date(iso).getTime();
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  if (hrs < 48) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function waitText(min: number | null): string {
  if (min === null) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h >= 48 ? `${Math.round(h / 24)} days` : `${h} hr${h > 1 ? "s" : ""}`;
}
