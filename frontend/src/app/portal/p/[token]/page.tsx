"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PortalBody } from "@/components/projects/portal-view";
import { STYLES, errorText } from "@/components/projects/projects-ui";
import { portalDecide, portalDownload, portalMessage, portalRedeem, portalVerify, portalView } from "@/lib/project-portal-api";
import type { ClientView } from "@/lib/projects-api";

const KEY = (t: string) => `nx-portal-${t.slice(0, 12)}`;

export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<string | null>(null);
  const [view, setView] = useState<ClientView | null>(null);
  const [needsCode, setNeedsCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (s: string) => {
    try {
      setView(await portalView(s));
      setErr("");
    } catch (e) {
      try { sessionStorage.removeItem(KEY(token)); } catch { /* storage unavailable */ }
      setSession(null);
      setErr(errorText(e));
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(KEY(token)); } catch { /* storage unavailable */ }
      if (saved) {
        setSession(saved);
        await load(saved);
        setBusy(false);
        return;
      }
      try {
        const r = await portalRedeem(token);
        if (r.needsCode) setNeedsCode(r.sentTo ?? "your email");
        else if (r.session) {
          try { sessionStorage.setItem(KEY(token), r.session); } catch { /* storage unavailable */ }
          setSession(r.session);
          await load(r.session);
        }
      } catch (e) {
        setErr(errorText(e));
      }
      setBusy(false);
    })();
  }, [token, load]);

  return (
    <div className="ui-projects" style={{ maxWidth: "1040px", margin: "0 auto", padding: "28px 16px" }}>
      <style>{STYLES}</style>
      {busy && <div style={{ fontSize: "13px", color: "#667085", textAlign: "center", padding: "60px" }}>Opening your project portal…</div>}
      {!busy && err && !view && (
        <div role="alert" style={{ background: "#fff", border: "1px solid #FECDCA", borderRadius: "14px", padding: "22px", fontSize: "13px", color: "#B42318", fontWeight: 700, textAlign: "center" }}>
          {err}
        </div>
      )}
      {!busy && needsCode && !session && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await portalVerify(token, code);
              try { sessionStorage.setItem(KEY(token), r.session); } catch { /* storage unavailable */ }
              setSession(r.session);
              setNeedsCode(null);
              await load(r.session);
            } catch (er) {
              setErr(errorText(er));
            }
          }}
          style={{ maxWidth: "420px", margin: "40px auto", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "22px", display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#101828" }}>Enter your sign-in code</div>
          <div style={{ fontSize: "12.5px", color: "#475467" }}>We emailed a 6-digit code to {needsCode}. It expires in 10 minutes.</div>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoFocus aria-label="Sign-in code" style={{ height: "44px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "0 12px", fontSize: "18px", letterSpacing: "6px", textAlign: "center" }} />
          {err && <div role="alert" style={{ fontSize: "11.5px", color: "#B42318", fontWeight: 700 }}>{err}</div>}
          <button type="submit" disabled={code.length !== 6} style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "10px", padding: "11px", fontSize: "13px", fontWeight: 800, cursor: "pointer", opacity: code.length === 6 ? 1 : 0.6 }}>
            Open portal
          </button>
        </form>
      )}
      {view && session && (
        <>
          {note && <div role="status" style={{ marginBottom: "12px", background: "#ECFDF3", border: "1px solid #ABEFC6", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#067647" }}>{note}</div>}
          {err && <div role="alert" style={{ marginBottom: "12px", fontSize: "12.5px", color: "#B42318", fontWeight: 700 }}>{err}</div>}
          <PortalBody
            v={view}
            h={{
              mode: "live",
              onDecide: async (id, decision, comment) => {
                try {
                  await portalDecide(session, id, decision, comment);
                  setNote(`Recorded: ${decision.toLowerCase()} · your project team has been notified`);
                  await load(session);
                } catch (e) {
                  setErr(errorText(e));
                }
              },
              onDownload: async (id) => {
                try {
                  const r = await portalDownload(session, id);
                  window.open(r.url, "_blank", "noopener");
                } catch (e) {
                  setErr(errorText(e));
                }
              },
              onMessage: async (body) => {
                try {
                  const r = await portalMessage(session, body);
                  await load(session);
                  return r.inInbox;
                } catch (e) {
                  setErr(errorText(e));
                  return false;
                }
              },
            }}
          />
          <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "12px", textAlign: "center" }}>Secure project portal · visits are logged · powered by Noxtill</div>
        </>
      )}
    </div>
  );
}
