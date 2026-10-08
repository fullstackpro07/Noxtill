"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { careersApi } from "@/lib/people-api";

const box = { background: "#fff", border: "1px solid #E6EAF0", borderRadius: 16, padding: 18 } as const;
const inp = { border: "1px solid #E6EAF0", borderRadius: 10, padding: 10, fontSize: 13, minHeight: 42, width: "100%" } as const;
const money = (cur: string, v: number | null) => (v == null ? "" : `${cur} ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);

/** Public careers page: published vacancies and an application form (applications become candidates). */
export function CareersPage({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ["careers", slug], queryFn: () => careersApi.page(slug), retry: false });
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const submit = async (e: FormEvent<HTMLFormElement>, jobId: string) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) ?? "").trim();
    if (!v("name") || !v("email")) return setErr("Your name and email are required.");
    if (fd.get("consent") !== "on") return setErr("Please agree to the privacy notice.");
    const file = fd.get("file");
    setBusy(true);
    setErr(null);
    try {
      const r = await careersApi.apply(slug, { jobId, name: v("name"), email: v("email"), phone: v("phone"), availability: v("availability"), consent: "Given" }, file instanceof File && file.size ? file : null);
      setDone(r.reference);
      setOpen(null);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main style={{ minHeight: "100vh", background: "#F4F6F8", padding: "32px 16px", fontFamily: "inherit", color: "#101828" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {q.isLoading ? <div style={box}>Loading…</div> : null}
        {q.error ? (
          <div style={box}>
            <h1 style={{ margin: 0, fontSize: 20 }}>Careers</h1>
            <p style={{ color: "#475467", fontSize: 13.5 }}>{(q.error as Error).message}</p>
          </div>
        ) : null}
        {d ? (
          <>
            <div style={box}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#0E8442" }}>Careers</div>
              <h1 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-.5px" }}>Work at {d.business}</h1>
              {d.intro ? <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "#475467", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{d.intro}</p> : null}
            </div>
            {done ? (
              <div role="status" style={{ ...box, borderColor: "#D1F2DF", background: "#F7FCF9", fontSize: 13.5, color: "#0E8442", fontWeight: 700 }}>
                Thanks — your application was received (reference {done}). We’ll be in touch by email.
              </div>
            ) : null}
            {!d.jobs.length ? <div style={{ ...box, fontSize: 13.5, color: "#475467" }}>There are no open positions right now.</div> : null}
            {d.jobs.map((j) => (
              <section key={j.id} style={box}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{j.title}</h2>
                    <div style={{ fontSize: 12.5, color: "#667085", marginTop: 4 }}>
                      {j.department} · {j.location} · {j.workMode} · {j.employmentType}
                      {j.pay ? ` · ${money(d.currency, j.pay.min)}${j.pay.max != null ? ` – ${money(d.currency, j.pay.max)}` : ""} / month` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => { setOpen(open === j.id ? null : j.id); setErr(null); }} style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: 10, padding: "10px 15px", fontSize: 13, fontWeight: 800, cursor: "pointer", minHeight: 42 }}>
                    {open === j.id ? "Close" : "Apply"}
                  </button>
                </div>
                {j.description ? <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "#344054", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{j.description}</p> : null}
                {open === j.id ? (
                  <form onSubmit={(e) => void submit(e, j.id)} style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    <input name="name" placeholder="Full name *" aria-label="Full name" style={inp} />
                    <input name="email" type="email" placeholder="Email *" aria-label="Email" style={inp} />
                    <input name="phone" placeholder="Phone" aria-label="Phone" style={inp} />
                    <input name="availability" placeholder="When could you start?" aria-label="Availability" style={inp} />
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>
                      Resume (PDF, Word or text, up to 10 MB)
                      <input name="file" type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.odt" style={{ display: "block", marginTop: 6, fontSize: 12.5 }} />
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#344054", lineHeight: 1.5 }}>
                      <input type="checkbox" name="consent" style={{ width: 16, height: 16, accentColor: "#12A150", marginTop: 2 }} />
                      I agree that {d.business} may store and process my application for recruiting. It isn’t used for marketing.
                    </label>
                    {err ? <div role="alert" style={{ background: "#FEF3F2", border: "1px solid #FDD9D6", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#B42318", fontWeight: 700 }}>{err}</div> : null}
                    <button type="submit" disabled={busy} style={{ border: 0, background: "#0A1B2A", color: "#fff", borderRadius: 10, padding: "11px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", minHeight: 44, justifySelf: "start" }}>
                      {busy ? "Sending…" : "Send application"}
                    </button>
                  </form>
                ) : null}
              </section>
            ))}
          </>
        ) : null}
      </div>
    </main>
  );
}
