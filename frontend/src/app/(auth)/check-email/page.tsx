"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { changeUnverifiedEmail, fetchVerificationStatus, logout, resendVerification } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth-store";
import { AuthCard, BackToLogin, C, InfoNote, OrDivider, PrimaryButton } from "@/components/auth-flow/auth-ui";
import { refreshSession } from "@/components/auth-flow/session";

/** Opens the user's webmail when the domain is a known provider; otherwise the default mail app. */
function mailAppUrl(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (["gmail.com", "googlemail.com"].includes(domain)) return "https://mail.google.com/mail/u/0/#inbox";
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) return "https://outlook.live.com/mail/0/inbox";
  if (domain.startsWith("yahoo.")) return "https://mail.yahoo.com";
  if (["icloud.com", "me.com", "mac.com"].includes(domain)) return "https://www.icloud.com/mail";
  if (["proton.me", "protonmail.com"].includes(domain)) return "https://mail.proton.me";
  return "mailto:";
}

export default function CheckEmailPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  // Resend cooldown: an absolute deadline (from the server, or from our last resend) + a 1s clock.
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "neutral" | "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    if (hasHydrated && !accessToken) router.replace("/login?next=/check-email");
  }, [hasHydrated, accessToken, router]);

  // Polls the real verification flag so confirming in another tab moves this one on automatically.
  const { data: status, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["auth", "verification"],
    queryFn: fetchVerificationStatus,
    enabled: Boolean(accessToken),
    refetchInterval: 5000,
  });

  const effectiveDeadline = deadline ?? (status ? dataUpdatedAt + status.resendInSeconds * 1000 : 0);
  const countdown = Math.max(0, Math.ceil((effectiveDeadline - now) / 1000));

  useEffect(() => {
    if (!status?.verified) return;
    refreshSession().then((dest) => router.replace(dest === "/check-email" ? "/onboarding" : dest));
  }, [status?.verified, router]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [countdown, now]);

  const email = status?.email ?? "";

  const resend = useCallback(async () => {
    if (countdown > 0 || busy) return;
    setBusy(true);
    try {
      const r = await resendVerification();
      setNow(Date.now());
      setDeadline(Date.now() + r.resendInSeconds * 1000);
      setNotice(r.sent ? { tone: "success", text: `A new confirmation link is on its way to ${r.email}.` } : { tone: "danger", text: "We couldn't send the email just now. Please try again in a minute." });
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof ApiError ? err.message : "Couldn't resend — please try again." });
      refetch();
    } finally {
      setBusy(false);
    }
  }, [countdown, busy, refetch]);

  async function saveEmail() {
    setBusy(true);
    try {
      const r = await changeUnverifiedEmail(draftEmail.trim());
      setEditing(false);
      setNow(Date.now());
      setDeadline(Date.now() + r.resendInSeconds * 1000);
      setNotice({ tone: "success", text: `Updated — we sent a new link to ${r.email}.` });
      await refetch();
      await refreshSession();
    } catch (err) {
      setNotice({ tone: "danger", text: err instanceof ApiError ? err.message : "Couldn't change the email — please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function backToLogin() {
    try {
      await logout();
    } catch {
      /* session may already be gone */
    }
    useAuthStore.getState().clearSession();
    router.push("/login");
  }

  if (!hasHydrated || !accessToken) return null;

  return (
    <AuthCard wide>
      <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
        <div style={{ width: 148, height: 148, borderRadius: "50%", background: "linear-gradient(180deg, #F1FBF5 0%, #E4F6EC 100%)", display: "grid", placeItems: "center", animation: "nxPop .6s cubic-bezier(.22,1,.36,1) both" }}>
          <svg width="92" height="72" viewBox="0 0 92 72" fill="none" aria-hidden>
            <path d="M6 14 46 44 86 14v48a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#0E8A4A" />
            <rect x="20" y="4" width="52" height="42" rx="4" fill="#fff" />
            <rect x="30" y="18" width="32" height="4" rx="2" fill="#C7E7D4" />
            <rect x="30" y="28" width="22" height="4" rx="2" fill="#C7E7D4" />
            <path d="M6 14 46 44 86 14" stroke="#0A7540" strokeWidth="3" fill="none" strokeLinejoin="round" />
          </svg>
        </div>
        <svg width="40" height="40" viewBox="0 0 40 40" style={{ position: "absolute", left: "calc(50% + 65px)", top: 2 }} fill="none" stroke="#12A150" strokeWidth="4" strokeLinecap="round" aria-hidden>
          <path d="M8 24 2 30M20 14v-9M32 24l6 6" />
        </svg>
      </div>
      <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.02em", textAlign: "center", margin: "22px 0 10px" }}>Check your email</h1>
      <p style={{ fontSize: 16.5, color: C.secondary, textAlign: "center", margin: "0 0 24px", lineHeight: 1.55 }}>
        We sent a confirmation link to your email address. Please verify your account to continue to Step 2.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 14, background: C.mintSoft, border: "1px solid #DEF0E6", borderRadius: 14, padding: "14px 16px", marginBottom: 18 }}>
        <span style={{ width: 48, height: 48, flex: "none", borderRadius: 12, background: "#D9F0E3", display: "grid", placeItems: "center", color: C.primary }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </span>
        {editing ? (
          <span style={{ display: "flex", gap: 8, flex: 1, minWidth: 0 }}>
            <input
              type="email"
              autoFocus
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              aria-label="New email address"
              style={{ flex: 1, minWidth: 0, height: 44, border: `1px solid ${C.inputBorder}`, borderRadius: 10, padding: "0 12px", fontSize: 15 }}
            />
            <button type="button" onClick={saveEmail} disabled={busy} style={{ border: 0, background: C.confirm, color: "#fff", borderRadius: 10, padding: "0 14px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Save
            </button>
          </span>
        ) : (
          <span style={{ display: "block", minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, color: C.secondary }}>Confirmation email sent to</span>
            <span style={{ display: "block", fontSize: 17, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{email || "…"}</span>
          </span>
        )}
      </div>

      <PrimaryButton onClick={() => window.open(mailAppUrl(email), "_blank", "noopener")} style={{ gap: 12 }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 3h6v6M10 14 21 3M18 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h7" />
        </svg>
        Open email app
      </PrimaryButton>

      <OrDivider label="Didn't receive the email?" margin="20px 0 14px" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 18 }}>
        <button
          type="button"
          onClick={resend}
          disabled={countdown > 0 || busy}
          style={{ display: "flex", alignItems: "center", gap: 9, border: 0, background: "transparent", padding: "10px 16px", cursor: "pointer", fontSize: 15.5, fontWeight: 700, color: countdown > 0 ? C.muted : C.primary }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
          </svg>
          {countdown > 0 ? `Resend in ${countdown}s` : "Resend email"}
        </button>
        <span style={{ width: 1, height: 22, background: C.inputBorder }} />
        <button
          type="button"
          onClick={() => {
            setDraftEmail(email);
            setEditing((v) => !v);
          }}
          style={{ display: "flex", alignItems: "center", gap: 9, border: 0, background: "transparent", padding: "10px 16px", cursor: "pointer", fontSize: 15.5, fontWeight: 700, color: C.primary }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          {editing ? "Cancel" : "Change email"}
        </button>
      </div>

      {notice && <InfoNote tone={notice.tone} margin="0 0 12px">{notice.text}</InfoNote>}
      <InfoNote>Once confirmed, you&apos;ll be taken to the next setup step automatically.</InfoNote>
      <BackToLogin onClick={backToLogin} />
    </AuthCard>
  );
}
