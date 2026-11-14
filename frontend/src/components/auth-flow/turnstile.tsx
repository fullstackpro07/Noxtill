"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "expired-callback"?: () => void }) => string;
      remove: (id: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const turnstileEnabled = Boolean(SITE_KEY);

/**
 * Bot challenge on sign-in, signup and password reset (auth security spec §10.2). Renders only
 * when NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured; the token is verified server-side.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let widgetId: string | undefined;
    const mount = () => {
      if (window.turnstile && ref.current) {
        widgetId = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (t) => onToken(t),
          "expired-callback": () => onToken(null),
        });
      }
    };
    if (window.turnstile) mount();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = mount;
      document.head.appendChild(s);
    }
    return () => {
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [onToken]);
  if (!SITE_KEY) return null;
  return <div ref={ref} style={{ display: "flex", justifyContent: "center", margin: "0 0 16px" }} />;
}
