"use client";

import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import { useState } from "react";

/* Shared pieces of "Layout A" (Login, Signup, Check email, Confirmed, Forgot, Reset) — every value
 * below is lifted from Noxtill Auth & Onboarding.dc.html. */

export const C = {
  ink: "#0F172A",
  secondary: "#64748B",
  muted: "#94A3B8",
  slate: "#475569",
  hairline: "#ECEFF3",
  inputBorder: "#E2E8F0",
  divider: "#E8EBF0",
  primary: "#0B6E3B",
  confirm: "#0B8A49",
  active: "#12A150",
  complete: "#0E8A4A",
  mint: "#DCF3E5",
  mintSoft: "#F3FAF6",
  danger: "#DC2626",
};

export function AuthCard({ children, wide, padding, style }: { children: ReactNode; wide?: boolean; padding?: string; style?: CSSProperties }) {
  return (
    <div
      className="nx-auth-card"
      style={{
        width: "100%",
        maxWidth: wide ? 520 : 470,
        border: `1px solid ${C.hairline}`,
        borderRadius: 22,
        padding: padding ?? "40px 36px 32px",
        boxShadow: "0 18px 50px -24px rgba(15,23,42,.16)",
        background: "#fff",
        animation: "nxFade .45s ease both",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function LogoN({ width = 108 }: { width?: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- brand asset rendered at an exact design width */}
      <img src="/brand/noxtill-n.png" alt="Noxtill" style={{ width, height: "auto", display: "block" }} />
    </div>
  );
}

export function Title({ children, size = 32, margin = "20px 0 6px" }: { children: ReactNode; size?: number; margin?: string }) {
  return (
    <h1 style={{ fontSize: size, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-.02em", textAlign: "center", margin, color: C.ink }}>
      {children}
    </h1>
  );
}

export function Subtitle({ children, size = 17, margin = "0 0 26px", lineHeight }: { children: ReactNode; size?: number; margin?: string; lineHeight?: number }) {
  return <p style={{ fontSize: size, color: C.secondary, textAlign: "center", margin, lineHeight }}>{children}</p>;
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 8, color: C.ink }}>
      {children}
    </label>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  height: 52,
  border: `1px solid ${C.inputBorder}`,
  borderRadius: 12,
  padding: "0 16px",
  fontSize: 16,
  color: C.ink,
  background: "#fff",
};

export function TextField({ style, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} style={{ ...inputStyle, ...(invalid ? { border: `1px solid ${C.danger}` } : null), ...style }} />;
}

export function PasswordField({
  value,
  onChange,
  placeholder,
  marginBottom = 16,
  autoComplete,
  id,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  marginBottom?: number;
  autoComplete?: string;
  id?: string;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom }}>
      <input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, padding: "0 48px 0 16px", ...(invalid ? { border: `1px solid ${C.danger}` } : null) }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: 8, top: 8, width: 36, height: 36, border: 0, background: "transparent", cursor: "pointer", color: C.secondary, display: "grid", placeItems: "center" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
}

/** Weak / Fair / Strong — same thresholds as the design prototype. */
export function strengthOf(pw: string): 0 | 1 | 2 | 3 {
  return pw.length >= 10 ? 3 : pw.length >= 7 ? 2 : pw.length > 0 ? 1 : 0;
}

export function StrengthMeter({ password, marginBottom = 20 }: { password: string; marginBottom?: number }) {
  const score = strengthOf(password);
  const color = (n: number) => (score >= n ? (score === 3 ? C.complete : score === 2 ? "#D97706" : C.danger) : C.divider);
  const label = score === 3 ? "Strong" : score === 2 ? "Fair" : score === 1 ? "Weak" : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom }} aria-live="polite">
      {[1, 2, 3].map((n) => (
        <div key={n} style={{ flex: 1, height: 5, borderRadius: 99, background: color(n) }} />
      ))}
      <span style={{ fontSize: 12, fontWeight: 700, color: C.secondary, minWidth: 54, textAlign: "right" }}>{label}</span>
    </div>
  );
}

export function ArrowRight({ size = 18, width = 2.4 }: { size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowLeft({ size = 18, width = 2.1 }: { size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  height = 56,
  background = C.primary,
  hover = "primary",
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  height?: number;
  background?: string;
  hover?: "primary" | "confirm";
  style?: CSSProperties;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={hover === "confirm" ? "nx-hover-confirm" : "nx-hover-primary"}
      style={{
        width: "100%",
        height,
        border: 0,
        borderRadius: 12,
        background,
        color: "#fff",
        fontSize: 17,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        opacity: disabled ? 0.7 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function OrDivider({ label, margin = "22px 0" }: { label: string; margin?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin }}>
      <div style={{ height: 1, background: C.divider, flex: 1 }} />
      <span style={{ fontSize: 14, color: C.muted }}>{label}</span>
      <div style={{ height: 1, background: C.divider, flex: 1 }} />
    </div>
  );
}

export function InfoNote({ children, margin = "0 0 20px", tone = "neutral" }: { children: ReactNode; margin?: string; tone?: "neutral" | "success" | "danger" }) {
  const bg = tone === "success" ? C.mintSoft : tone === "danger" ? "#FEF2F2" : "#F6F8FA";
  const fg = tone === "success" ? C.primary : tone === "danger" ? "#B91C1C" : C.slate;
  const icon = tone === "success" ? C.confirm : tone === "danger" ? C.danger : C.secondary;
  return (
    <div role={tone === "danger" ? "alert" : undefined} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: bg, borderRadius: 12, padding: "14px 16px", margin }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={icon} strokeWidth="1.8" style={{ flex: "none", marginTop: 1 }}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 11v5M12 7.6v.5" strokeLinecap="round" />
      </svg>
      <p style={{ margin: 0, fontSize: 14.5, color: fg, lineHeight: 1.5 }}>{children}</p>
    </div>
  );
}

export function BackToLogin({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, border: 0, background: "transparent", padding: 6, cursor: "pointer", fontSize: 15.5, fontWeight: 600, color: C.slate }}
    >
      <ArrowLeft />
      Back to login
    </button>
  );
}

export function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z" />
      <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A11.9 11.9 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.6 14.7a7 7 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.7z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.6 11.6 0 0 0 1.8 7.1l3.8 3a7.1 7.1 0 0 1 6.4-5.3z" />
    </svg>
  );
}

export function AppleIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="#000" aria-hidden>
      <path d="M14.8 10.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.2-2.8.8-3.6.8-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.5-3.9zM12.4 3.6c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.5z" />
    </svg>
  );
}

export function SocialButton({ children, onClick, disabled, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-disabled={disabled}
      className="nx-hover-soft"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        height: 54,
        border: `1px solid ${C.inputBorder}`,
        background: "#fff",
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 600,
        color: C.ink,
        cursor: "pointer",
        width: "100%",
      }}
    >
      {children}
    </button>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" style={{ margin: "-6px 0 14px", fontSize: 14, color: C.danger, fontWeight: 600, lineHeight: 1.45 }}>
      {message}
    </p>
  );
}
