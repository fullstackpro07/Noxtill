"use client";

import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { portalApi, type HelpCenter, type PortalArticle } from "@/lib/helpdesk-portal-api";
import { ArticleList, ArticleView, SupportFrame, box, inp, primary } from "@/components/helpdesk/support-ui";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Public help center: published "Public" articles and the request form (the Web channel). */
function HelpCenterPageInner() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [article, setArticle] = useState<PortalArticle | null>(null);
  const [f, setF] = useState({ name: "", email: "", phone: "", category: "", subject: "", description: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<{ token: string; number: string } | null>(null);

  const q = useQuery({ queryKey: ["support-center", slug], queryFn: () => portalApi.center(slug) });
  const c: HelpCenter | undefined = q.data;
  const err = q.error ? errText(q.error) : "";
  const category = f.category || c?.categories[0] || "";
  const a = search.get("article");
  useEffect(() => {
    if (!a) return;
    portalApi.centerArticle(slug, a).then(setArticle, (e: unknown) => setMsg(errText(e)));
  }, [a, slug]);

  if (err) return <SupportFrame business="Help center" sub="Not available"><div style={{ ...box, color: "#B42318" }}>{err}</div></SupportFrame>;
  if (!c) return <SupportFrame business="Help center" sub="Loading…"><div style={{ ...box, color: "#667085" }}>Loading…</div></SupportFrame>;
  const open = (s: string) => router.push(`/support/h/${slug}?article=${encodeURIComponent(s)}`);
  const submit = async () => {
    if (!f.name.trim() || !f.subject.trim() || !f.description.trim()) return setMsg("Add your name, a subject and a description.");
    if (!f.phone.trim() && !f.email.trim()) return setMsg("Add your phone number or email so we can reply.");
    setBusy(true);
    try {
      const r = await portalApi.centerRequest(slug, { ...f, category });
      if (r.token && r.number) setDone({ token: r.token, number: r.number });
      setMsg("");
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SupportFrame business={c.business.name} sub="Help center">
      {article ? (
        <ArticleView a={article} onBack={() => { setArticle(null); router.push(`/support/h/${slug}`); }} onOpen={open} vote={(h, cm) => portalApi.centerVote(slug, article.slug, h, cm)} />
      ) : (
        <>
          <section style={box}>
            <h1 style={{ margin: "0 0 12px", fontSize: "20px", fontWeight: 800, letterSpacing: "-.4px" }}>How can we help?</h1>
            <ArticleList items={c.articles} onOpen={open} empty="No public help articles yet — send us a request below." />
          </section>
          <section style={box}>
            <div style={{ fontSize: "15px", fontWeight: 800, marginBottom: "10px" }}>Submit a request</div>
            {done ? (
              <div style={{ fontSize: "13.5px", lineHeight: 1.6 }}>
                Thanks — your request <b>{done.number}</b> was received.{" "}
                <Link href={`/support/t/${done.token}`} style={{ color: "#0E8442", fontWeight: 800 }}>
                  Follow it here
                </Link>{" "}
                (bookmark this link — it’s how you’ll see our replies).
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <input aria-label="Your name" placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={inp} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "8px" }}>
                  <input aria-label="Phone" placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} style={inp} />
                  <input aria-label="Email" placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={inp} />
                </div>
                <select aria-label="Topic" value={category} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp}>
                  {c.categories.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <input aria-label="Subject" placeholder="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} style={inp} />
                <textarea aria-label="Description" placeholder="Describe what you need" rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ ...inp, minHeight: undefined }} />
                <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} style={{ position: "absolute", left: "-9999px" }} />
                {msg ? <div role="alert" style={{ fontSize: "12.5px", color: "#B42318", fontWeight: 600 }}>{msg}</div> : null}
                <div>
                  <button type="button" onClick={() => void submit()} disabled={busy} style={primary}>
                    {busy ? "Sending…" : "Send request"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </SupportFrame>
  );
}

export default function HelpCenterPage() {
  return (
    <Suspense>
      <HelpCenterPageInner />
    </Suspense>
  );
}
