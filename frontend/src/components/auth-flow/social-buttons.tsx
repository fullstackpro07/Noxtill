"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuthProviders, fetchProviderStartUrl, type SocialProvider } from "@/lib/auth-api";
import { toast } from "@/lib/toast";
import { FacebookIcon, GoogleIcon, MicrosoftIcon, OrDivider, SocialButton } from "./auth-ui";

const PROVIDERS: { id: SocialProvider; label: string; Icon: () => React.JSX.Element }[] = [
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "microsoft", label: "Microsoft", Icon: MicrosoftIcon },
  { id: "facebook", label: "Facebook", Icon: FacebookIcon },
];

export function useAuthProviders() {
  return useQuery({ queryKey: ["auth", "providers"], queryFn: fetchAuthProviders, staleTime: 5 * 60_000, retry: false });
}

/**
 * Only providers the server reports as configured and switched on are shown — no placeholder
 * buttons that can't complete sign-in (auth spec §3.4). Renders nothing (not even the divider)
 * when no provider is available.
 */
export function SocialButtons({ dividerLabel = "or continue with email" }: { dividerLabel?: string }) {
  const { data: providers } = useAuthProviders();
  const [redirecting, setRedirecting] = useState<SocialProvider | null>(null);
  const shown = PROVIDERS.filter((p) => providers?.[p.id]);
  if (!shown.length) return null;

  async function start(provider: SocialProvider, label: string) {
    if (redirecting) return;
    setRedirecting(provider);
    try {
      const { url } = await fetchProviderStartUrl(provider);
      window.location.assign(url);
    } catch {
      setRedirecting(null);
      toast.error(`Couldn't start ${label} sign-in — please try again.`);
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.map(({ id, label, Icon }) => (
          <SocialButton key={id} onClick={() => start(id, label)} disabled={redirecting !== null}>
            <Icon />
            {redirecting === id ? `Redirecting to ${label}…` : `Continue with ${label}`}
          </SocialButton>
        ))}
      </div>
      <OrDivider label={dividerLabel} />
    </>
  );
}
