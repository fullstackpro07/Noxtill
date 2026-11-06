"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, ShieldCheck } from "lucide-react";
import { saApi, type LoginStage } from "@/lib/super-admin-api";
import { useSuperAdminAuth } from "@/store/super-admin-auth-store";
import { errMsg, inputCls, inputStyle } from "@/components/super-admin/ui";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const { accessToken, hasHydrated, setSession } = useSuperAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<LoginStage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasHydrated && accessToken) router.replace("/super-admin");
  }, [hasHydrated, accessToken, router]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setStage(await saApi.login(email, password));
      setPassword("");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!stage) return;
    setBusy(true);
    setError(null);
    try {
      const tokens = await saApi.verify(stage.challengeToken, code);
      setSession(tokens);
      router.replace("/super-admin");
    } catch (err) {
      setError(errMsg(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4" style={{ background: "var(--app-sidebar-bg)" }}>
      <div className="w-full max-w-[420px] rounded-2xl p-7 shadow-2xl" style={{ background: "var(--app-surface)" }}>
        <div className="mb-5 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/noxtill-n.png" alt="" className="h-8 w-auto" />
          <div>
            <div className="text-[18px] font-extrabold" style={{ color: "var(--app-text)" }}>
              Noxtill Super Admin
            </div>
            <div className="text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
              Internal staff only. Every sign-in is logged.
            </div>
          </div>
        </div>

        {!stage && (
          <form onSubmit={submitPassword} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                Email
              </span>
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} style={inputStyle} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                Password
              </span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} style={inputStyle} />
            </label>
            <SubmitButton busy={busy} label="Continue" />
          </form>
        )}

        {stage?.stage === "enroll" && (
          <form onSubmit={submitCode} className="space-y-3">
            <div className="rounded-xl border p-3 text-[12.5px] leading-relaxed" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}>
              <strong style={{ color: "var(--app-text)" }}>Set up two-factor authentication.</strong> Super Admin accounts must use an authenticator app (Google Authenticator, 1Password, Authy…). Scan this code, then enter the 6-digit code it shows.
            </div>
            <div className="flex justify-center rounded-xl border p-4" style={{ borderColor: "var(--app-border)" }}>
              <QRCodeSVG value={stage.otpauthUrl} size={176} />
            </div>
            <div className="text-center text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
              Can&apos;t scan? Enter this key manually:
              <div className="mt-1 select-all break-all font-mono text-[12px]" style={{ color: "var(--app-text)" }}>
                {stage.secret}
              </div>
            </div>
            <CodeInput code={code} setCode={setCode} />
            <SubmitButton busy={busy} label="Verify and sign in" disabled={code.length !== 6} />
          </form>
        )}

        {stage?.stage === "totp" && (
          <form onSubmit={submitCode} className="space-y-3">
            <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--app-text-faint)" }}>
              <ShieldCheck className="h-4 w-4" style={{ color: "var(--app-primary)" }} /> Enter the code from your authenticator app.
            </div>
            <CodeInput code={code} setCode={setCode} />
            <SubmitButton busy={busy} label="Sign in" disabled={code.length !== 6} />
          </form>
        )}

        {error && (
          <div role="alert" className="mt-3 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "#fef3f2", color: "var(--app-danger-strong)" }}>
            {error}
          </div>
        )}
        {stage && (
          <button
            type="button"
            className="mt-4 text-[12px] font-semibold underline"
            style={{ color: "var(--app-text-faintest)" }}
            onClick={() => {
              setStage(null);
              setCode("");
              setError(null);
            }}
          >
            Start again
          </button>
        )}
      </div>
    </div>
  );
}

function CodeInput({ code, setCode }: { code: string; setCode: (v: string) => void }) {
  return (
    <label className="block">
      <span className="sr-only">Authenticator code</span>
      <input
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className={`${inputCls} text-center font-mono text-[20px] tracking-[8px]`}
        style={inputStyle}
        placeholder="000000"
      />
    </label>
  );
}

function SubmitButton({ busy, label, disabled }: { busy: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
      style={{ background: "var(--app-primary)" }}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />} {label}
    </button>
  );
}
