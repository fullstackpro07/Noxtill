"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchNumberPrice, fetchPriceCountries, startPurchase, type PriceRow, type PurchaseKey, type UsageOverview } from "@/lib/usage-api";
import { Modal, U, ghostBtn, money2, primaryBtn } from "./usage-ui";

const DEFS: Record<PurchaseKey, { title: string; item: string; metric: string; billing: string; recurring: boolean; note: string }> = {
  credits: { title: "Buy AI credits", item: "1,000 AI credits", metric: "ai_credits", billing: "One-time", recurring: false, note: "Bought credits are kept separate from your monthly allowance. They never expire and are used only after your included credits run out." },
  seat: { title: "Add a user seat", item: "1 additional user", metric: "users", billing: "Added to your subscription", recurring: true, note: "The seat is added once payment is confirmed. Stripe charges the prorated amount for the rest of this period." },
  location: { title: "Add a location", item: "1 additional location", metric: "locations", billing: "Added to your subscription", recurring: true, note: "The location is added once payment is confirmed." },
  localnum: { title: "Add a local phone number", item: "1 local phone number", metric: "phone_numbers_local", billing: "Monthly rental", recurring: true, note: "You choose the number and connect it in AI Phone Receptionist. It becomes available once payment is confirmed." },
  tollfree: { title: "Add a toll-free number", item: "1 toll-free number", metric: "phone_numbers_tollfree", billing: "Monthly rental", recurring: true, note: "Only available where the phone provider supports toll-free numbers. It becomes available once payment is confirmed." },
  agentseat: { title: "Add a human agent seat", item: "1 human agent seat", metric: "agent_seats", billing: "Monthly seat", recurring: true, note: "Agent seats are separate from Noxtill user seats. The seat is added once payment is confirmed." },
};

export function priceFor(prices: PriceRow[], metric: string, numberType?: string): number | null {
  const row = prices.find((p) => p.metricCode === metric && !p.countryCode && (numberType == null || p.numberType === numberType)) ?? prices.find((p) => p.metricCode === metric && !p.countryCode);
  return row ? row.unitPriceUsd : null;
}

export function buyLabel(o: UsageOverview, key: PurchaseKey): string {
  const d = DEFS[key];
  const p = priceFor(o.prices, d.metric);
  if (p == null) return d.title;
  const short = { credits: "Buy 1,000 credits", seat: "Add a seat", location: "Add a location", localnum: "Add local number", tollfree: "Add toll-free number", agentseat: "Add agent seat" }[key];
  if (key === "localnum" || key === "tollfree") return `${short} · from ${money2(p).replace(".00", "")}/month`;
  return `${short} · ${key === "credits" ? money2(p).replace(".00", "") : `${money2(p).replace(".00", "")}/month`}`;
}

/** Why a purchase can't start right now, or null when it can. The server re-checks. */
export function buyBlocker(o: UsageOverview, key: PurchaseKey): string | null {
  if (!o.providers.stripe) return "Payments aren't connected yet (Stripe isn't configured), so nothing can be bought right now.";
  if (o.set.suspended) return "Reactivate your subscription before buying more.";
  if (DEFS[key].recurring && o.set.status === "trialing") return "Add-ons attach to a paid subscription. Choose a plan first — nothing is added during the trial.";
  return null;
}

export function BuyDialog({ o, k, onClose, onDone }: { o: UsageOverview; k: PurchaseKey; onClose: () => void; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const d = DEFS[k];
  const isNumber = k === "localnum" || k === "tollfree";
  const [country, setCountry] = useState("US");
  const countries = useQuery({ queryKey: ["usage", "price-countries"], queryFn: fetchPriceCountries, enabled: isNumber, staleTime: 3600_000 });
  const quote = useQuery({ queryKey: ["usage", "number-price", country, k], queryFn: () => fetchNumberPrice(country, k === "tollfree" ? "tollfree" : "local"), enabled: isNumber, retry: false });
  const price = priceFor(o.prices, d.metric);
  // Numbers are priced per country from the provider's live price; everything else is a seed price
  // per pack (1,000 credits) or per unit (one seat/location).
  const amount = isNumber ? (quote.data?.priceUsd ?? null) : price;
  const blocker = buyBlocker(o, k);
  const names = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
  const countryName = (c: string) => { try { return names?.of(c) ?? c; } catch { return c; } };
  const countryList = [...new Set(["US", ...(countries.data ?? []).map((c) => c.countryCode)])].sort((a, b) => (a === "US" ? -1 : b === "US" ? 1 : countryName(a).localeCompare(countryName(b))));
  const buy = useMutation({
    mutationFn: () => startPurchase(k, isNumber ? country : undefined),
    onSuccess: (r) => {
      if (r.checkoutUrl) {
        window.location.assign(r.checkoutUrl);
        return;
      }
      void qc.invalidateQueries({ queryKey: ["usage"] });
      onDone(`${d.item} added. Payment confirmed by Stripe.`);
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "The purchase didn't go through. Nothing was charged."),
  });
  return (
    <Modal title={d.title} onClose={onClose} width={460}>
      <dl style={{ margin: 0, background: U.subtle, borderRadius: 11, padding: "4px 14px" }}>
        {[
          ["Item", d.item],
          ["Price", isNumber && quote.isLoading ? "Checking current price…" : amount == null ? (isNumber ? "Price unavailable right now" : "No published price") : `${money2(amount)}${d.recurring ? " / month" : ""}`],
          ["Billing", d.billing],
          ["Tax", "Calculated by Stripe"],
        ].map(([kk, v], i) => (
          <div key={kk} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i < 3 ? "1px solid #EEF1F4" : 0, fontSize: 12.5 }}>
            <dt style={{ flex: 1, color: U.muted, fontWeight: 600 }}>{kk}</dt>
            <dd style={{ margin: 0, color: U.text, fontWeight: 800, textAlign: "right" }}>{v}</dd>
          </div>
        ))}
      </dl>
      {isNumber ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: U.text2, fontWeight: 600 }}>
          Country for this number
          <select value={country} onChange={(e) => { setCountry(e.target.value); setOk(false); setErr(""); }} style={{ height: 38, borderRadius: 9, border: "1px solid #D9DEE4", padding: "0 10px", fontSize: 13 }}>
            {countryList.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </select>
          <span style={{ fontWeight: 400, color: U.text3, lineHeight: 1.5 }}>Number prices vary by country and number type. The exact price is shown here before you buy.</span>
        </label>
      ) : null}
      {isNumber && quote.isError ? (
        <div role="alert" style={{ fontSize: 12, color: U.warnText, fontWeight: 700, lineHeight: 1.5 }}>
          {quote.error instanceof ApiError ? quote.error.message : "We couldn't check the price for this country right now."}
        </div>
      ) : null}
      <div style={{ fontSize: 12, color: U.text3, lineHeight: 1.55 }}>{d.note}</div>
      {blocker ? <div style={{ fontSize: 12, color: U.warnText, fontWeight: 700, lineHeight: 1.5 }}>{blocker}</div> : null}
      {err ? (
        <div role="alert" style={{ fontSize: 12, color: U.danger, fontWeight: 700 }}>
          {err}
        </div>
      ) : null}
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, color: U.text2, lineHeight: 1.5, cursor: "pointer" }}>
        <input type="checkbox" checked={ok} onChange={() => setOk(!ok)} style={{ width: 18, height: 18, margin: "1px 0 0", accentColor: "var(--app-primary)", flex: "0 0 18px" }} />
        I approve this purchase at the price shown.
      </label>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={ghostBtn()}>
          Cancel
        </button>
        <button type="button" disabled={!ok || !!blocker || buy.isPending || amount == null} onClick={() => buy.mutate()} style={primaryBtn(!ok || !!blocker || amount == null)}>
          {buy.isPending ? "Working…" : d.recurring ? "Confirm and pay" : "Continue to payment"}
        </button>
      </div>
    </Modal>
  );
}
