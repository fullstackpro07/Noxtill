"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchCommunication, updateSpendCap, type CommPeriod, type CommunicationUsage } from "@/lib/usage-api";
import { apiFetch } from "@/lib/api-client";
import { useUsageOverview } from "./usage-shell";
import { Bar, Modal, Pill, Rule, Skeleton, Toast, U, dateTime, fmtInt, ghostBtn, h2, money2, pctOf, primaryBtn, rangeUtc, section, selectStyle, sub, th, theadRow, toneFor, tr } from "./usage-ui";

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const countryName = (iso: string | null | undefined) => (!iso || iso === "—" ? "—" : (regionNames?.of(iso) ?? iso));
const flag = (iso: string | null | undefined) =>
  iso && /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "";

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt style={{ fontSize: 11, color: U.muted, fontWeight: 600 }}>{k}</dt>
      <dd style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 800, color: U.text }}>{v}</dd>
    </div>
  );
}

function ChannelCard({ name, status, sub: subtitle, big, unit, stats, rows, note, ok }: { name: string; status: [string, boolean]; sub?: string; big: number; unit: string; stats: [string, number][]; rows: [string, string, boolean?][]; note: string; ok: boolean }) {
  return (
    <div style={{ ...section, padding: 15, display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: U.text }}>{name}</span>
        <Pill bg={status[1] ? U.greenSoft : U.warnBg} fg={status[1] ? "var(--app-primary-hover)" : U.warnText}>
          {status[0]}
        </Pill>
      </div>
      {subtitle ? <div style={{ fontSize: 12, color: U.text3, fontWeight: 600, marginTop: -4 }}>{subtitle}</div> : null}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.5px", color: U.ink }}>{fmtInt(big)}</span>
        <span style={{ fontSize: 12, color: U.muted, fontWeight: 600 }}>{unit}</span>
      </div>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(88px,1fr))", gap: 8 }}>
        {stats.map(([k, v]) => (
          <Stat key={k} k={k} v={fmtInt(v)} />
        ))}
      </dl>
      <dl style={{ margin: 0, borderTop: `1px solid ${U.line}`, paddingTop: 9, display: "flex", flexDirection: "column", gap: 5 }}>
        {rows.map(([k, v, bold]) => (
          <div key={k} style={{ display: "flex", gap: 8, fontSize: 12 }}>
            <dt style={{ flex: 1, color: U.muted, fontWeight: 600 }}>{k}</dt>
            <dd style={{ margin: 0, color: U.text, fontWeight: bold ? 800 : 600, textAlign: "right" }}>{v}</dd>
          </div>
        ))}
      </dl>
      <div style={{ fontSize: 11.5, color: ok ? "var(--app-primary-hover)" : U.text3, lineHeight: 1.45, borderTop: `1px solid ${U.line}`, paddingTop: 8, fontWeight: 600 }}>{note}</div>
    </div>
  );
}

export function CommunicationPage() {
  const ov = useUsageOverview();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<CommPeriod>("current");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bCh, setBCh] = useState<"email" | "sms" | "whatsapp">("sms");
  const [hCh, setHCh] = useState("all");
  const [hSt, setHSt] = useState("all");
  const [pick, setPick] = useState<string>("US");
  const [pickQ, setPickQ] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [capIn, setCapIn] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4200);
  };
  const q = useQuery({
    queryKey: ["usage", "comm", period, from, to],
    queryFn: () => fetchCommunication(period, from || undefined, to || undefined),
    enabled: period !== "custom" || (!!from && !!to),
  });
  const prices = useQuery({ queryKey: ["usage", "country-prices", "sms"], queryFn: () => apiFetch<{ countryCode: string; unitPriceUsd: number }[]>("/usage/country-prices?metric=sms_segments") });
  const saveCap = useMutation({
    mutationFn: (capUsd: number) => updateSpendCap("messaging", { capUsd }),
    onSuccess: () => {
      setConfirm(null);
      setCapIn(null);
      void qc.invalidateQueries({ queryKey: ["usage"] });
      flash("Messaging limit saved. The change is recorded in your usage history.");
    },
    onError: (e) => {
      setConfirm(null);
      flash(e instanceof ApiError ? e.message : "Couldn't save the limit.");
    },
  });
  const smsList = useMemo(
    () => (prices.data ?? []).map((p) => ({ iso: p.countryCode, name: countryName(p.countryCode), price: p.unitPriceUsd })).sort((a, b) => a.name.localeCompare(b.name)),
    [prices.data],
  );
  if (!ov.data) return null;
  const trial = ov.data.set.status === "trialing";
  const d: CommunicationUsage | undefined = q.data;
  const providers = ov.data.providers;
  const cap = ov.data.set.spendCaps.messaging;
  const periodLabel = d ? `${{ current: "Current billing period", previous: "Previous billing period", last30: "Last 30 days", custom: "Custom range" }[period]} · ${rangeUtc(d.window.start, new Date(new Date(d.window.end).getTime() - 1).toISOString())}` : "";
  const emailRow = ov.data.prices.find((x) => x.metricCode === "emails" && !x.countryCode);
  const emailPriceText = emailRow ? `${money2(emailRow.unitPriceUsd).replace(".00", "")} per ${fmtInt(emailRow.per)} emails` : "No published price";
  const minSms = smsList.length ? Math.min(...smsList.map((x) => x.price)) : null;
  const off = trial ? "is off during the free trial. Nothing is sent or charged." : "isn't connected on this server yet. Nothing is sent or charged, and you don't need to do anything.";
  const selected = smsList.find((x) => x.iso === pick) ?? smsList[0];
  const filtered = smsList.filter((x) => !pickQ || x.name.toLowerCase().includes(pickQ.toLowerCase()) || x.iso.toLowerCase() === pickQ.toLowerCase());
  const capPct = pctOf(cap.spentUsd + cap.reservedUsd, cap.capUsd);
  const capTone = toneFor(capPct);

  const breakdown = (() => {
    if (!d) return { rows: [] as [string, number, string, string, number | null, boolean?][], totals: [] as [string, string][] };
    if (bCh === "email") {
      const e = d.email;
      return {
        rows: [["Sent", e.sent, "Message", "#F2F4F7", null], ["↳ Delivered", e.delivered, "Status of sent", U.infoBg, null, true], ["↳ Failed", e.failed, "Not charged", "#F2F4F7", null, true], ["Billable emails", e.billable, "Billable", U.warnBg, e.charge]] as [string, number, string, string, number | null, boolean?][],
        totals: [["Billable", `${fmtInt(e.billable)} emails`], ["Price", emailPriceText], ["Tax", "Added on invoice"], ["Total before tax", money2(e.charge)]] as [string, string][],
      };
    }
    if (bCh === "sms") {
      const s = d.sms;
      return {
        rows: [["Incoming", s.incoming, "Not charged", "#F2F4F7", null], ["Outgoing", s.sent, "Message", "#F2F4F7", null], ["↳ Delivered", s.delivered, "Status of sent", U.infoBg, null, true], ["↳ Failed", s.failed, "Not charged", "#F2F4F7", null, true], ["Billable segments", s.segments, "Billable", U.warnBg, s.charge]] as [string, number, string, string, number | null, boolean?][],
        totals: [["Billable", `${fmtInt(s.segments)} segments`], ["Price", "By recipient country"], ["Tax", "Added on invoice"], ["Total before tax", money2(s.charge)]] as [string, string][],
      };
    }
    const w = d.whatsapp;
    return {
      rows: [["Incoming", w.incoming, "Not charged", "#F2F4F7", null], ["Outgoing", w.sent, "Message", "#F2F4F7", null], ["↳ Delivered", w.delivered, "Status of sent", U.infoBg, null, true], ["↳ Failed", w.failed, "Not charged", "#F2F4F7", null, true], ["Marketing", w.marketing, "Billed by Meta", "#F2F4F7", null], ["Utility", w.utility, "Billed by Meta", "#F2F4F7", null]] as [string, number, string, string, number | null, boolean?][],
      totals: [["Billable by Noxtill", "0 messages"], ["Price", "Not billed by Noxtill"], ["Tax", "—"], ["Total before tax", money2(0)]] as [string, string][],
    };
  })();

  const hist = (d?.history ?? []).filter((h) => (hCh === "all" || h.channel === hCh) && (hSt === "all" || h.status === hSt));

  return (
    <>
      <section style={{ ...section, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={h2}>Communication usage</h2>
          <p style={sub}>Emails and SMS are billed at Noxtill prices within your monthly messaging limit. {periodLabel}</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: U.text2 }}>
          Billing period
          <select value={period} onChange={(e) => setPeriod(e.target.value as CommPeriod)} style={selectStyle}>
            <option value="current">Current month</option>
            <option value="previous">Previous month</option>
            <option value="last30">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {period === "custom" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexBasis: "100%", justifyContent: "flex-end", flexWrap: "wrap", fontSize: 12, color: U.muted, fontWeight: 600 }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" style={{ ...selectStyle, padding: "9px 11px" }} />
            <span>to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" style={{ ...selectStyle, padding: "9px 11px" }} />
          </div>
        ) : null}
      </section>

      {!d ? (
        q.isLoading || period !== "custom" ? <Skeleton rows={2} /> : <div style={{ fontSize: 12.5, color: U.muted }}>Pick a start and end date.</div>
      ) : (
        <>
          <section data-r2="1" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
            <ChannelCard
              name="Emails"
              status={trial ? ["Off in trial", false] : providers.email ? ["Connected", true] : ["Email service unavailable", false]}
              sub={providers.emailFrom ? `Sender ${providers.emailFrom}` : undefined}
              big={d.email.sent}
              unit="emails sent"
              stats={[["Delivered", d.email.delivered], ["Failed", d.email.failed], ["Billable", d.email.billable]]}
              rows={[["Price", emailPriceText], ["Charges", money2(d.email.charge), true]]}
              note={!trial && providers.email ? "You can send emails." : `Noxtill's email delivery ${off}`}
              ok={!trial && providers.email}
            />
            <ChannelCard
              name="SMS"
              status={trial ? ["Off in trial", false] : providers.sms ? ["Available", true] : ["Messaging service unavailable", false]}
              sub={d.sms.byCountry.length ? `${d.sms.byCountry.length} recipient countr${d.sms.byCountry.length === 1 ? "y" : "ies"}` : undefined}
              big={d.sms.sent}
              unit="SMS sent"
              stats={[["Delivered", d.sms.delivered], ["Failed", d.sms.failed], ["Billable segments", d.sms.segments]]}
              rows={[["Price", minSms != null ? `By country · from $${minSms.toFixed(3)} / segment` : "By country"], ["Charges", money2(d.sms.charge), true]]}
              note={!trial && providers.sms ? `You can send SMS to Noxtill's ${smsList.length} priced countries.` : `Noxtill's SMS delivery ${off}`}
              ok={!trial && providers.sms}
            />
            <ChannelCard
              name="WhatsApp messages"
              status={providers.whatsapp ? ["Connected", true] : ["Business account connection required", false]}
              sub={providers.whatsappNumber ? `Business number ${providers.whatsappNumber}` : undefined}
              big={d.whatsapp.sent}
              unit="messages sent"
              stats={[["Received", d.whatsapp.incoming], ["Delivered", d.whatsapp.delivered], ["Failed", d.whatsapp.failed]]}
              rows={[["Price", "Billed by Meta to you"], ["Noxtill charges", money2(0), true]]}
              note={providers.whatsapp ? "Your own WhatsApp Business account sends these, so Meta bills you directly. Noxtill charges nothing for WhatsApp." : "Connect your WhatsApp Business account in Integrations to send from your own number. Meta bills you directly; Noxtill charges nothing."}
              ok={providers.whatsapp}
            />
          </section>

          <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ ...h2, flex: 1 }}>Messaging spending limit</h2>
              <Pill bg={trial ? U.line : capTone.bg} fg={trial ? U.text3 : capTone.fg}>
                {trial ? "Off in trial" : capTone.label}
              </Pill>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: U.ink, letterSpacing: "-.5px" }}>{money2(cap.spentUsd)}</span>
              <span style={{ fontSize: 12, color: U.muted, fontWeight: 600 }}>of {money2(cap.capUsd)} monthly limit for emails and SMS</span>
            </div>
            <Bar pct={capPct} reservedPct={pctOf(cap.reservedUsd, cap.capUsd)} color={capTone.bar} height={8} label="Messaging spend" />
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: U.text2 }}>
                Monthly limit (USD)
                <input type="number" min={1} step={1} value={capIn ?? String(cap.capUsd)} onChange={(e) => setCapIn(e.target.value)} style={{ padding: "9px 11px", border: `1px solid ${U.border}`, borderRadius: 9, fontSize: 13, background: U.subtle, minHeight: 42, width: 160 }} />
              </label>
              <button
                type="button"
                onClick={() => {
                  const v = Math.floor(Number(capIn ?? cap.capUsd));
                  if (!(v >= 1)) return flash("Enter a monthly limit of $1 or more.");
                  setConfirm(v);
                }}
                style={primaryBtn(false, { minHeight: 42 })}
              >
                Review &amp; save
              </button>
              <span style={{ fontSize: 11.5, color: U.muted, flex: 1, minWidth: 200 }}>{money2(cap.reservedUsd)} is set aside for messages already queued. A message is only queued if its price fits in what&apos;s left.</span>
            </div>
          </section>

          <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <h2 style={h2}>Country prices</h2>
              <p style={sub}>Pick a country to see its Noxtill price. SMS and WhatsApp have separate country lists.</p>
            </div>
            <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
              <div style={{ border: `1px solid ${U.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: U.text }}>SMS</span>
                  <span style={{ fontSize: 11.5, color: U.muted, fontWeight: 700 }}>{smsList.length} countries</span>
                </div>
                <div style={{ position: "relative" }}>
                  <button type="button" aria-haspopup="listbox" aria-expanded={pickOpen} onClick={() => setPickOpen(!pickOpen)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, border: `1px solid ${pickOpen ? U.green : U.border}`, background: "#fff", borderRadius: 10, padding: "0 12px", minHeight: 44, cursor: "pointer", fontSize: 13, fontWeight: 600, color: U.text, textAlign: "left" }}>
                    <span aria-hidden>{flag(selected?.iso)}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected?.name ?? "No countries yet"}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  {pickOpen ? (
                    <>
                      <div onClick={() => setPickOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                      <div role="listbox" aria-label="SMS countries" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", border: `1px solid ${U.border}`, borderRadius: 12, boxShadow: "0 16px 40px rgba(16,24,40,.16)", zIndex: 41, overflow: "hidden" }}>
                        <div style={{ padding: 8, borderBottom: `1px solid ${U.line}` }}>
                          <input autoFocus value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="Search country or code" aria-label="Search countries" style={{ width: "100%", padding: "9px 11px", border: `1px solid ${U.border}`, borderRadius: 9, fontSize: 12.5, background: U.subtle, minHeight: 38 }} />
                        </div>
                        <div style={{ maxHeight: 280, overflowY: "auto", padding: 4 }}>
                          {filtered.map((c) => (
                            <button key={c.iso} type="button" role="option" aria-selected={c.iso === selected?.iso} onClick={() => { setPick(c.iso); setPickOpen(false); setPickQ(""); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, border: 0, background: c.iso === selected?.iso ? U.greenSoft : "transparent", borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left", fontSize: 12.5, color: U.text, minHeight: 38 }}>
                              <span aria-hidden>{flag(c.iso)}</span>
                              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                              <span style={{ fontWeight: 800 }}>${c.price.toFixed(3)}</span>
                            </button>
                          ))}
                          {filtered.length === 0 ? <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: U.muted }}>No country matches.</div> : null}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
                {selected ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, background: U.subtle, borderRadius: 10, padding: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: U.ink, letterSpacing: "-.4px" }}>${selected.price.toFixed(3)}</div>
                      <div style={{ fontSize: 11.5, color: U.muted, fontWeight: 600 }}>per SMS segment · USD, before tax</div>
                    </div>
                    <Pill bg={!trial && providers.sms ? U.greenSoft : U.warnBg} fg={!trial && providers.sms ? "var(--app-primary-hover)" : U.warnText}>
                      {!trial && providers.sms ? "Sending available" : "Not live yet"}
                    </Pill>
                  </div>
                ) : null}
              </div>
              <div style={{ border: `1px solid ${U.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: U.text }}>WhatsApp</span>
                </div>
                <div style={{ fontSize: 12.5, color: U.text3, lineHeight: 1.55 }}>
                  WhatsApp is sent through your own WhatsApp Business account, so Meta bills you directly at its own country rates. Noxtill publishes no WhatsApp prices because it charges nothing for WhatsApp.
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: U.muted, lineHeight: 1.5 }}>Prices are in USD, before tax. Destinations without a published price aren&apos;t listed and can&apos;t be messaged.</div>
          </section>

          <section style={{ ...section, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 12px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h2 style={h2}>Message breakdown</h2>
                <p style={sub}>{periodLabel}</p>
              </div>
              <select value={bCh} onChange={(e) => setBCh(e.target.value as "email" | "sms" | "whatsapp")} aria-label="Channel" style={selectStyle}>
                <option value="email">Emails</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
                <thead>
                  <tr style={theadRow}>
                    <th style={{ ...th, paddingLeft: 20 }}>Message type</th>
                    <th style={{ ...th, textAlign: "right" }}>Count</th>
                    <th style={th}>Counted as</th>
                    <th style={{ ...th, paddingRight: 20, textAlign: "right" }}>Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.rows.map(([k, v, tag, bg, charge, child]) => (
                    <tr key={k} style={tr}>
                      <td style={{ padding: `10px 10px 10px ${child ? 38 : 20}px`, fontWeight: child ? 600 : 700, color: U.text }}>{k}</td>
                      <td style={{ padding: 10, textAlign: "right", fontWeight: 800, color: U.text }}>{fmtInt(v)}</td>
                      <td style={{ padding: 10 }}>
                        <Pill bg={bg} fg={bg === U.warnBg ? U.warnText : bg === U.infoBg ? U.info : U.text3}>
                          {tag}
                        </Pill>
                      </td>
                      <td style={{ padding: "10px 20px 10px 10px", textAlign: "right", fontWeight: 700, color: U.text }}>{charge == null ? "—" : money2(charge)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bCh === "sms" && d.sms.byCountry.length ? (
              <div style={{ overflowX: "auto", borderTop: `1px solid ${U.line}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 620 }}>
                  <thead>
                    <tr style={theadRow}>
                      <th style={{ ...th, paddingLeft: 20 }}>Recipient country</th>
                      <th style={{ ...th, textAlign: "right" }}>Sent</th>
                      <th style={{ ...th, textAlign: "right" }}>Billable segments</th>
                      <th style={{ ...th, paddingRight: 20, textAlign: "right" }}>Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.sms.byCountry.map((c) => (
                      <tr key={c.iso} style={tr}>
                        <td style={{ padding: "10px 20px", fontWeight: 700, color: U.text }}>
                          {flag(c.iso)} {countryName(c.iso)}
                        </td>
                        <td style={{ padding: 10, textAlign: "right", color: U.text2 }}>{fmtInt(c.sent)}</td>
                        <td style={{ padding: 10, textAlign: "right", fontWeight: 700, color: U.text }}>{fmtInt(c.billable)}</td>
                        <td style={{ padding: "10px 20px 10px 10px", textAlign: "right", fontWeight: 800, color: U.text }}>{money2(c.charge)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, padding: "14px 20px", borderTop: `1px solid ${U.line}`, background: "#FCFCFD" }}>
              {breakdown.totals.map(([k, v]) => (
                <div key={k}>
                  <dt style={{ fontSize: 11, color: U.muted, fontWeight: 600 }}>{k}</dt>
                  <dd style={{ margin: "3px 0 0", fontSize: 13.5, fontWeight: 800, color: U.text }}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section style={{ ...section, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", flexWrap: "wrap", borderBottom: `1px solid ${U.line}` }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h2 style={h2}>Usage history</h2>
                <p style={sub}>
                  {hist.length} of {d.history.length} billed messages
                </p>
              </div>
              <select value={hCh} onChange={(e) => setHCh(e.target.value)} aria-label="Channel" style={selectStyle}>
                <option value="all">All channels</option>
                <option value="Emails">Emails</option>
                <option value="SMS">SMS</option>
                <option value="WhatsApp">WhatsApp</option>
              </select>
              <select value={hSt} onChange={(e) => setHSt(e.target.value)} aria-label="Status" style={selectStyle}>
                <option value="all">Any status</option>
                {Array.from(new Set(d.history.map((h) => h.status))).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {hist.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 820 }}>
                  <thead>
                    <tr style={theadRow}>
                      {["Date", "Channel", "Country", "Type"].map((x, i) => (
                        <th key={x} style={{ ...th, paddingLeft: i === 0 ? 20 : 10 }}>{x}</th>
                      ))}
                      <th style={{ ...th, textAlign: "right" }}>Billable</th>
                      <th style={{ ...th, textAlign: "right" }}>Charge</th>
                      <th style={{ ...th, paddingRight: 20 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hist.map((h) => (
                      <tr key={h.id} style={tr}>
                        <td style={{ padding: "10px 20px", color: U.text3, whiteSpace: "nowrap" }}>{dateTime(h.at)}</td>
                        <td style={{ padding: 10, fontWeight: 700, color: U.text }}>{h.channel}</td>
                        <td style={{ padding: 10, color: U.text2, whiteSpace: "nowrap" }}>
                          {flag(h.countryCode)} {countryName(h.countryCode)}
                        </td>
                        <td style={{ padding: 10, color: U.text3, textTransform: "capitalize" }}>{h.type || "—"}</td>
                        <td style={{ padding: 10, textAlign: "right", fontWeight: 700, color: U.text }}>
                          {fmtInt(h.quantity)} {h.unit}
                          {h.quantity === 1 ? "" : "s"}
                        </td>
                        <td style={{ padding: 10, textAlign: "right", fontWeight: 800, color: U.text }}>{h.priceUsd == null ? "—" : money2(h.priceUsd)}</td>
                        <td style={{ padding: "10px 20px 10px 10px" }}>
                          <Pill bg={h.status === "completed" ? U.greenSoft : U.line} fg={h.status === "completed" ? "var(--app-primary-hover)" : U.text3}>
                            {h.status === "completed" ? "Delivered to provider" : h.status}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12.5, color: U.muted }}>{d.history.length ? "No messages match these filters." : "No messages yet this billing period."}</div>
            )}
          </section>

          <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
            <h2 style={{ ...h2, fontSize: 14 }}>How it&apos;s counted</h2>
            <Rule>Incoming messages are never charged.</Rule>
            <Rule>A message that fails to send is never charged — the amount set aside for it is released.</Rule>
            <Rule>An SMS is charged per segment (160 plain characters, or 70 with emoji or non-Latin text) at the recipient country&apos;s price.</Rule>
            <Rule>Extra sending is never charged beyond your monthly messaging limit.</Rule>
          </section>
        </>
      )}

      {confirm != null ? (
        <Modal title="Save messaging limit?" onClose={() => setConfirm(null)}>
          <Rule>Your monthly limit for emails and SMS will be {money2(confirm)}.</Rule>
          <Rule>A new message is only sent if its price fits in what&apos;s left. Messages already queued still go out.</Rule>
          <Rule>You&apos;ll get alerts at 50%, 75%, 90% and 100%. Nothing is charged beyond this limit.</Rule>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" onClick={() => setConfirm(null)} style={ghostBtn()}>
              Cancel
            </button>
            <button type="button" disabled={saveCap.isPending} onClick={() => saveCap.mutate(confirm)} style={primaryBtn()}>
              Save limit
            </button>
          </div>
        </Modal>
      ) : null}
      <Toast message={toast} />
    </>
  );
}
