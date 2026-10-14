"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuthProviders, fetchGoogleAuthUrl } from "@/lib/auth-api";
import { toast } from "@/lib/toast";
import { AppleIcon, GoogleIcon, SocialButton } from "./auth-ui";

/** Google is a real OAuth sign-in when the server has credentials; Apple has none configured and says so. */
export function SocialButtons() {
  const { data: providers } = useQuery({ queryKey: ["auth", "providers"], queryFn: fetchAuthProviders, staleTime: 5 * 60_000, retry: false });
  const [redirecting, setRedirecting] = useState(false);

  async function google() {
    if (!providers?.google) {
      toast.info("Google sign-in isn't configured on this server yet — use your email instead.");
      return;
    }
    setRedirecting(true);
    try {
      const { url } = await fetchGoogleAuthUrl();
      window.location.assign(url);
    } catch {
      setRedirecting(false);
      toast.error("Couldn't start Google sign-in — please try again.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SocialButton onClick={google} disabled={redirecting} title={providers && !providers.google ? "Google sign-in is not configured" : undefined}>
        <GoogleIcon />
        {redirecting ? "Redirecting to Google…" : "Continue with Google"}
      </SocialButton>
      <SocialButton
        onClick={() => toast.info("Sign in with Apple isn't available yet — use Google or your email.")}
        title="Sign in with Apple is not available yet"
      >
        <AppleIcon />
        Continue with Apple
      </SocialButton>
    </div>
  );
}
