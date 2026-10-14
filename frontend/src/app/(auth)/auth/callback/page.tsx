"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, C, LogoN, Title } from "@/components/auth-flow/auth-ui";
import { establishSession } from "@/components/auth-flow/session";

/** Google sign-in returns here with the session tokens in the URL fragment (never sent to any server). */
export default function AuthCallbackPage() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    window.history.replaceState(null, "", window.location.pathname);
    if (!accessToken || !refreshToken) {
      router.replace("/login?error=google_exchange");
      return;
    }
    establishSession({ accessToken, refreshToken })
      .then((dest) => router.replace(dest))
      .catch(() => router.replace("/login?error=google_exchange"));
  }, [router]);

  return (
    <AuthCard>
      <LogoN width={92} />
      <Title size={26}>Signing you in…</Title>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
        <span style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #D7F0E1", borderTopColor: C.complete, animation: "nxSpin .9s linear infinite" }} />
      </div>
    </AuthCard>
  );
}
