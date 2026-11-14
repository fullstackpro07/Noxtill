"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { AuthCard, C, InfoNote, LogoN, Subtitle, Title } from "@/components/auth-flow/auth-ui";
import "@/components/auth-flow/auth-flow.css";

type Status = { confirmationCode: string; status: string; createdAt: string; completedAt: string | null };

/**
 * Status page Meta links to after a Facebook "data deletion request" (auth security spec §4.3).
 * Shows the real status of that request by its confirmation code.
 */
export default function FacebookDeletionStatusPage() {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ok"; data: Status } | { kind: "error"; message: string }>({ kind: "loading" });

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      // The code only exists in the browser URL, so it can only be read after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: "error", message: "This link is missing its confirmation code." });
      return;
    }
    apiFetch<Status>(`/auth/facebook/data-deletion/${encodeURIComponent(code)}`, {}, { skipAuth: true })
      .then((data) => setState({ kind: "ok", data }))
      .catch((err) => setState({ kind: "error", message: err instanceof ApiError ? err.message : "We couldn't look up that request." }));
  }, []);

  return (
    <div className="nx-flow" style={{ display: "flex", justifyContent: "center", padding: "64px 20px", background: "#fff", minHeight: "100vh" }}>
      <AuthCard wide>
        <LogoN width={92} />
        <Title size={28}>Facebook data deletion</Title>
        <Subtitle size={16}>Status of a deletion request made from your Facebook settings.</Subtitle>
        {state.kind === "loading" && <p style={{ textAlign: "center", color: C.secondary }}>Looking up your request…</p>}
        {state.kind === "error" && <InfoNote tone="danger">{state.message}</InfoNote>}
        {state.kind === "ok" && (
          <>
            <InfoNote tone={state.data.status === "completed" ? "success" : "neutral"}>
              {state.data.status === "completed"
                ? `Done. The Facebook sign-in link for this account was deleted on ${new Date(state.data.completedAt ?? state.data.createdAt).toLocaleString()}.`
                : `Received on ${new Date(state.data.createdAt).toLocaleString()} and being processed.`}
            </InfoNote>
            <p style={{ fontSize: 14.5, color: C.secondary, lineHeight: 1.55 }}>
              Confirmation code: <strong style={{ fontFamily: "ui-monospace, Consolas, monospace" }}>{state.data.confirmationCode}</strong>. This removes the data Noxtill received
              through Facebook Login. Your Noxtill account and its business records are separate; to delete those, use the{" "}
              <Link href="/privacy/choices">privacy request form</Link>.
            </p>
          </>
        )}
      </AuthCard>
    </div>
  );
}
