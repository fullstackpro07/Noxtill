"use client";

import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { portalApi, type PortalArticle, type TicketPortal } from "@/lib/helpdesk-portal-api";
import { ArticleList, ArticleView, SupportFrame, box, ghost, inp, primary } from "@/components/helpdesk/support-ui";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Customer portal for one support request: public replies and status only. */
function TicketPortalPageInner() {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [article, setArticle] = useState<PortalArticle | null>(null);
  const [req, setReq] = useState<{ subject: string; description: string; category: string } | null>(null);

  const q = useQuery({ queryKey: ["support-ticket", token], queryFn: () => portalApi.view(token), refetchInterval: 30_000 });
  const v: TicketPortal | undefined = q.data;
  const err = q.error ? errText(q.error) : "";
  const load = () => q.refetch();
  const slug = search.get("article");
  useEffect(() => {
    if (!slug) return;
    portalApi.article(token, slug).then(setArticle, (e: unknown) => setMsg(errText(e)));
  }, [slug, token]);

  if (err) return <SupportFrame business="Support" sub="Customer portal"><div style={{ ...box, color: "#B42318" }}>{err}</div></SupportFrame>;
  if (!v) return <SupportFrame business="Support" sub="Loading…"><div style={{ ...box, color: "#667085" }}>Loading your request…</div></SupportFrame>;
  const t = v.ticket;
  const openArticle = (s: string) => router.push(`/support/t/${token}?article=${encodeURIComponent(s)}`);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await portalApi.reply(token, text.trim());
      setText("");
      if (r.newToken) {
        setMsg(`This request was closed, so we opened ${r.number} for your message.`);
        router.push(`/support/t/${r.newToken}`);
      } else {
        setMsg("Message sent. We’ll reply here.");
        await load();
      }
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const rate = async () => {
    if (!rating) return setMsg("Choose a rating first.");
    setBusy(true);
    try {
      await portalApi.rate(token, rating, comment.trim() || undefined);
      setMsg("Thanks for rating our support.");
      await load();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const submitRequest = async () => {
    if (!req?.subject.trim() || !req.description.trim()) return setMsg("Add a subject and a description.");
    setBusy(true);
    try {
      const r = await portalApi.request(token, req);
      setReq(null);
      router.push(`/support/t/${r.token}`);
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const scale = v.survey.scale;
  const choices = scale === "1–10" ? Array.from({ length: 10 }, (_, i) => [i + 1, String(i + 1)] as const) : scale === "Good / Bad" ? ([[5, "👍 Good"], [1, "👎 Bad"]] as const) : Array.from({ length: 5 }, (_, i) => [i + 1, "★".repeat(i + 1)] as const);

  return (
    <SupportFrame business={v.business.name} sub={`Support request ${t.number}`}>
      {msg ? <div role="status" style={{ ...box, padding: "12px 14px", background: "#F7FCF9", borderColor: "#D1F2DF", color: "#0E8442", fontSize: "13px", fontWeight: 600 }}>{msg}</div> : null}
      {article ? (
        <ArticleView a={article} onBack={() => { setArticle(null); router.push(`/support/t/${token}`); }} onOpen={openArticle} vote={(h, c) => portalApi.vote(token, article.slug, h, c)} />
      ) : (
        <>
          <section style={box}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800, letterSpacing: "-.4px", flex: 1 }}>{t.subject}</h1>
              <span style={{ fontSize: "12px", fontWeight: 800, borderRadius: "6px", padding: "4px 9px", background: t.open ? "#ECFDF3" : "#F2F4F7", color: t.open ? "#0E8442" : "#475467" }}>{t.status}</span>
            </div>
            <div style={{ fontSize: "12px", color: "#667085", marginTop: "4px" }}>
              {t.number} · opened {when(t.createdAt)}
            </div>
          </section>

          {v.survey.canRate || v.survey.rated ? (
            v.survey.canRate ? (
              <section style={{ ...box, borderColor: "#D1F2DF" }}>
                <div style={{ fontSize: "15px", fontWeight: 800 }}>{v.survey.lang === "Urdu" ? "ہماری مدد کیسی رہی؟" : v.survey.lang === "English + Urdu" ? "How did we do? · ہماری مدد کیسی رہی؟" : "How did we do?"}</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", margin: "10px 0" }}>
                  {choices.map(([n, l]) => (
                    <button key={n} type="button" onClick={() => setRating(n)} aria-pressed={rating === n} style={{ ...ghost, borderColor: rating === n ? "#12A150" : "#E6EAF0", background: rating === n ? "#ECFDF3" : "#fff", color: rating === n ? "#0E8442" : "#344054" }}>
                      {l}
                    </button>
                  ))}
                </div>
                {v.survey.comment ? <textarea aria-label="Comment (optional)" placeholder="Anything you’d like to add? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} style={{ ...inp, minHeight: undefined }} /> : null}
                <button type="button" onClick={() => void rate()} disabled={busy} style={{ ...primary, marginTop: "10px" }}>
                  Send rating
                </button>
              </section>
            ) : v.survey.rated ? (
              <section style={box}>Thanks — you rated this request {v.survey.rated.rating}{scale === "1–10" ? "/10" : scale === "Good / Bad" ? "" : "/5"}.</section>
            ) : null
          ) : null}

          <section style={box}>
            <div style={{ fontSize: "15px", fontWeight: 800, marginBottom: "10px" }}>Conversation</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {v.messages.map((m) => (
                <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "88%", background: m.mine ? "#EFF8FF" : "#F7FCF9", border: `1px solid ${m.mine ? "#D1E9FF" : "#D1F2DF"}`, borderRadius: "12px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "11.5px", color: "#667085", marginBottom: "4px" }}>
                    <b style={{ color: "#101828" }}>{m.by}</b> · {when(m.at)}
                  </div>
                  <div style={{ fontSize: "13.5px", whiteSpace: "pre-wrap", lineHeight: 1.55, overflowWrap: "anywhere" }}>{m.body}</div>
                  {m.attachments.length ? (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                      {m.attachments.map((a) => (
                        <button key={a.i} type="button" style={{ ...ghost, minHeight: "32px", padding: "5px 9px", fontSize: "12px" }} onClick={() => void portalApi.attachment(token, m.id, a.i).then((r) => window.open(r.url, "_blank", "noopener"), (e: unknown) => setMsg(errText(e)))}>
                          📎 {a.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {!v.messages.length ? <div style={{ fontSize: "13px", color: "#667085" }}>No messages yet.</div> : null}
            </div>
            <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <textarea aria-label="Your message" placeholder={t.closed ? "This request is closed — writing here opens a new follow-up request." : "Write a message…"} value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ ...inp, minHeight: undefined }} />
              <div>
                <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} style={primary}>
                  {busy ? "Sending…" : "Send message"}
                </button>
              </div>
            </div>
          </section>

          <section style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div style={{ fontSize: "15px", fontWeight: 800, flex: 1 }}>Need something else?</div>
              {!req ? (
                <button type="button" style={ghost} onClick={() => setReq({ subject: "", description: "", category: v.categories[0] ?? "" })}>
                  Open a new request
                </button>
              ) : null}
            </div>
            {req ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <input aria-label="Subject" placeholder="Subject" value={req.subject} onChange={(e) => setReq({ ...req, subject: e.target.value })} style={inp} />
                <select aria-label="Topic" value={req.category} onChange={(e) => setReq({ ...req, category: e.target.value })} style={inp}>
                  {v.categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <textarea aria-label="Description" placeholder="How can we help?" value={req.description} onChange={(e) => setReq({ ...req, description: e.target.value })} rows={4} style={{ ...inp, minHeight: undefined }} />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" style={primary} disabled={busy} onClick={() => void submitRequest()}>
                    Submit request
                  </button>
                  <button type="button" style={ghost} onClick={() => setReq(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            <div style={{ fontSize: "13px", fontWeight: 800, margin: "12px 0 8px" }}>Help articles</div>
            <ArticleList items={v.articles} onOpen={openArticle} empty="No help articles published yet." />
          </section>
        </>
      )}
    </SupportFrame>
  );
}

export default function TicketPortalPage() {
  return (
    <Suspense>
      <TicketPortalPageInner />
    </Suspense>
  );
}
