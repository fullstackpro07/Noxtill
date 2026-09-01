import { apiFetch } from "@/lib/api-client";

/** POST /auth/2fa/enable — sends a real WhatsApp code to the user's own phone. */
export function enableTwoFactor(): Promise<{ sent: true }> {
  return apiFetch<{ sent: true }>("/auth/2fa/enable", { method: "POST" });
}

/** POST /auth/2fa/confirm */
export function confirmTwoFactor(code: string): Promise<{ enabled: true }> {
  return apiFetch<{ enabled: true }>("/auth/2fa/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/** POST /auth/2fa/disable */
export function disableTwoFactor(password: string): Promise<{ enabled: false }> {
  return apiFetch<{ enabled: false }>("/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}
