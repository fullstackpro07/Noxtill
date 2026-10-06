"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { signApi } from "@/lib/contracts-api";

const box = { background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 18 } as const;
const btn = (primary = true) => ({ border: primary ? 0 : "1px solid #E6EAF0", background: primary ? "#12A150" : "#fff", color: primary ? "#fff" : "#344054", borderRadius: 10, padding: "11px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", minHeight: 44 }) as const;

/** Drawing pad that yields a PNG data URL (kept small so it fits the request limit). */
function Pad({ onChange }: { onChange: (url: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 480, ((e.clientY - r.top) / r.height) * 140] as const;
  };
  return (
    <div>
      <canvas
        ref={ref}
        width={480}
        height={140}
        aria-label="Draw your signature"
        style={{ width: "100%", maxWidth: 480, height: 140, border: "1px dashed #D0D5DD", borderRadius: 10, touchAction: "none", background: "#FAFBFC", cursor: "crosshair" }}
        onPointerDown={(e) => {
          drawing.current = true;
          const c = ref.current!.getContext("2d")!;
          c.lineWidth = 2.2;
          c.lineCap = "round";
          c.strokeStyle = "#0F172A";
          const [x, y] = pos(e);
          c.beginPath();
          c.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const c = ref.current!.getContext("2d")!;
          const [x, y] = pos(e);
          c.lineTo(x, y);
          c.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          onChange(ref.current!.toDataURL("image/png"));
        }}
      />
      <button
        type="button"
        onClick={() => {
          ref.current!.getContext("2d")!.clearRect(0, 0, 480, 140);
          onChange("");
        }}
        style={{ ...btn(false), minHeight: 34, padding: "6px 12px", fontSize: 12, marginTop: 6 }}
      >
        Clear
      </button>
    </div>
  );
}

/** Noxtill eSign — the page a signer opens from their emailed link. */
export function SignPage({ token }: { token: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sign", token], queryFn: () => signApi.view(token), retry: false });
  const [picked, setMethod] = useState<"Typed" | "Drawn">("Typed");
  const [typed, setTyped] = useState("");
  const [drawn, setDrawn] = useState("");
  const [otp, setOtp] = useState("");
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState("");
  const v = q.data;
  const method = (v && !v.methods.includes(picked) && v.methods[0] ? v.methods[0] : picked) as "Typed" | "Drawn";
  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setErr(null);
    try {
      setMsg(await fn());
      await qc.invalidateQueries({ queryKey: ["sign", token] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ minHeight: "100vh", background: "#F4F6F8", padding: "28px 16px", fontFamily: "inherit" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "#0A1B2A", color: "#39E28B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>✍</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{v?.business ?? "Noxtill eSign"}</div>
            <div style={{ fontSize: 12, color: "#667085" }}>Secure signing · Noxtill eSign</div>
          </div>
        </div>
        {q.isLoading ? <div style={box}>Loading…</div> : null}
        {q.error ? (
          <div style={{ ...box, borderColor: "#FDD9D6", background: "#FEF3F2", color: "#B42318", fontWeight: 700 }}>{(q.error as Error).message}</div>
        ) : null}
        {v ? (
          <>
            <div style={box}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: "#0E8442" }}>{v.request} · version {v.version}</div>
              <h1 style={{ margin: "6px 0 4px", fontSize: 20, fontWeight: 800, color: "#0F172A" }}>{v.title}</h1>
              <div style={{ fontSize: 12.5, color: "#475467", lineHeight: 1.55 }}>
                Signing as <b>{v.signer.name}</b> ({v.signer.role}) · {v.signer.email} · expires {v.deadline}
                {v.others.length ? <> · other signers: {v.others.map((o) => `${o.name} (${o.status})`).join(", ")}</> : null}
              </div>
              {v.sha256 ? <div style={{ fontSize: 11, color: "#667085", marginTop: 6, fontFamily: "ui-monospace,monospace", overflowWrap: "anywhere" }}>Document fingerprint (SHA-256): {v.sha256}</div> : null}
            </div>
            <div style={box}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>Document</div>
                {v.file ? (
                  <a href={v.file.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 800, color: "#0E8442" }}>
                    Open the original file{v.file.name ? ` (${v.file.name})` : ""}
                  </a>
                ) : null}
              </div>
              {v.text ? <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, color: "#101828", maxHeight: 420, overflowY: "auto", background: "#FAFBFC", borderRadius: 10, padding: 14 }}>{v.text}</pre> : <p style={{ margin: 0, fontSize: 12.5, color: "#475467" }}>This file has no text preview — open the original file to read it before signing.</p>}
            </div>
            {v.signer.status === "Signed" ? (
              <div style={{ ...box, borderColor: "#D1F2DF", background: "#ECFDF3", color: "#0E8442", fontWeight: 800 }}>✓ You signed this document{v.signer.signedAt ? ` on ${new Date(v.signer.signedAt).toLocaleString()}` : ""}. You can close this page.</div>
            ) : v.blocked ? (
              <div style={{ ...box, borderColor: "#FDE3B3", background: "#FEF6E7", color: "#7A2E0B", fontWeight: 700 }}>{v.blocked}</div>
            ) : declining ? (
              <div style={{ ...box, display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }} htmlFor="why">Why are you declining? The sender sees this.</label>
                <textarea id="why" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} style={{ border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 13 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" disabled={busy || !why.trim()} style={{ ...btn(), background: "#B42318" }} onClick={() => void act(async () => (await signApi.decline(token, why), "You declined. The sender has been told."))}>Decline to sign</button>
                  <button type="button" style={btn(false)} onClick={() => setDeclining(false)}>Back</button>
                </div>
              </div>
            ) : (
              <div style={{ ...box, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>Your signature</div>
                {v.methods.length > 1 ? (
                  <div role="tablist" style={{ display: "flex", gap: 6 }}>
                    {v.methods.map((m) => (
                      <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => setMethod(m as "Typed" | "Drawn")} style={{ ...btn(method === m), minHeight: 36, padding: "7px 14px", background: method === m ? "#0A1B2A" : "#fff" }}>
                        {m === "Typed" ? "Type" : "Draw"}
                      </button>
                    ))}
                  </div>
                ) : null}
                {method === "Typed" ? (
                  <div>
                    <input aria-label="Type your full name" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your full name" style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: 10, padding: 12, fontSize: 15, minHeight: 46 }} />
                    {typed ? <div style={{ marginTop: 8, fontSize: 26, fontFamily: "'Brush Script MT', cursive", color: "#0F172A" }}>{typed}</div> : null}
                  </div>
                ) : (
                  <Pad onChange={setDrawn} />
                )}
                {v.otp ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input aria-label="One-time code" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" style={{ border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 14, width: 140, minHeight: 44, letterSpacing: 3 }} />
                    <button type="button" disabled={busy} style={btn(false)} onClick={() => void act(async () => (await signApi.otp(token), `Code emailed to ${v.signer.email}. It lasts 10 minutes.`))}>Email me a code</button>
                  </div>
                ) : null}
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#344054", lineHeight: 1.5 }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#12A150", marginTop: 1 }} />
                  I’ve read this document and agree to sign it electronically. My name, the time, my IP address and device are recorded as evidence.
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={busy || !agree || (method === "Typed" ? typed.trim().length < 2 : !drawn) || (v.otp && otp.length !== 6)}
                    style={btn()}
                    onClick={() => void act(async () => ((await signApi.sign(token, { sigType: method, sigData: method === "Typed" ? typed.trim() : drawn, otp: v.otp ? otp : undefined, agree })).completed ? "Signed. Everyone has now signed — the document is complete." : "Signed. Thank you — the sender has been updated."))}
                  >
                    {busy ? "Working…" : "Sign document"}
                  </button>
                  <button type="button" style={btn(false)} onClick={() => setDeclining(true)}>Decline</button>
                </div>
              </div>
            )}
            {msg ? <div role="status" style={{ ...box, borderColor: "#D1F2DF", background: "#F7FCF9", color: "#0E8442", fontWeight: 700 }}>{msg}</div> : null}
            {err ? <div role="alert" style={{ ...box, borderColor: "#FDD9D6", background: "#FEF3F2", color: "#B42318", fontWeight: 700 }}>{err}</div> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
