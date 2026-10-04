"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { payApi, payDownload, type PayBoot, type PayScreen, type PRow } from "@/lib/payments-api";
import { scopeOf, usePay, type MField, type MValues } from "./pay-store";
import type { RenderHandlers } from "./pay-render";

export const TAB_PATH: Record<string, string> = { overview: "", transactions: "/transactions", requests: "/requests", recovery: "/recovery", refunds: "/refunds", disputes: "/disputes", payouts: "/payouts", recurring: "/recurring", routing: "/routing", reconciliation: "/reconciliation", settings: "/settings" };
const VIEW_KEY: Record<string, string> = { requests: "rqView", recovery: "rcView", refunds: "rfView", disputes: "dsView", payouts: "poView", recurring: "mdView", routing: "rtView", reconciliation: "rcnView" };
const F_KEY: Record<string, string> = { "ov-f": "ov", tx: "tx", rq: "rq", rcv: "rcv" };
const HIGH_RISK = ["retry.maxAttempts", "refund.approvalAbove", "safeguards.liveConfirm", "collection.captureMode", "risk.manualReviewAbove"];

export const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const O = (a: (string | [string, string])[]) => a.map((x) => (typeof x === "string" ? { v: x, t: x } : { v: x[0], t: x[1] }));
const F = (name: string, label: string, type: MField["type"] = "text", o: Partial<MField> = {}): MField => ({ name, label, type, ...o });
const sv = (v: MValues, k: string) => (Array.isArray(v[k]) ? (v[k] as string[]).join(",") : ((v[k] as string) ?? ""));

export function usePayActions(boot: PayBoot | undefined, screen: PayScreen | undefined) {
  const router = useRouter();
  const qc = useQueryClient();
  const st = usePay;

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ["pay"] }), [qc]);
  const go = useCallback((tab: string) => {
    st.getState().set({ drawer: null, sel: [] });
    router.push(`/payments${TAB_PATH[tab] ?? ""}`);
  }, [router, st]);
  const ext = useCallback((path: string) => router.push(path), [router]);
  const flash = (t: string) => st.getState().flash(t);
  const open = (kind: string, id: string) => st.getState().set({ drawer: { kind, id } });
  const live = () => st.getState().env === "live" && !!boot?.policy.liveConfirm;
  const liveF = (): MField[] => (live() ? [F("live", "Live confirmation", "select", { req: true, options: O([["", "Choose…"], ["yes", "I understand this moves real money"]]) })] : []);
  const liveNote = () => (st.getState().env === "live" ? "LIVE — this moves real money. The provider’s confirmation, not this button, decides the final state." : "TEST MODE — sandbox only. No real money moves.");
  const isLive = (v: MValues) => !live() || sv(v, "live") === "yes";

  /** Run a call, toast its message, refresh every Payments query. */
  const run = useCallback(async (fn: () => Promise<string | void>) => {
    try {
      const m = await fn();
      if (m) flash(m);
    } catch (e) {
      flash(errText(e));
    }
    await invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidate]);

  const modal = st.getState().openModal;
  const after = async (msg: string) => {
    flash(msg);
    await invalidate();
  };

  const rowOf = (bid: string, id: string): PRow | undefined => {
    for (const r of screen?.rows ?? []) for (const b of r.blocks) if (b.card && b.id === bid && b.table) { const x = b.table.rows.find((y) => y.id === id); if (x) return x; }
    return undefined;
  };
  const copy = async (txt: string, label: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      flash(`${label}: ${txt}`);
    } catch {
      flash(`${label}: ${txt}`);
    }
  };

  const confirm = (o: { title: string; sub?: string; primaryT: string; danger?: boolean; dark?: boolean; reason?: boolean; reasonL?: string; isLive?: boolean; note?: string; fn: (reason: string, liveOk: boolean) => Promise<string | void> }) =>
    modal({
      title: o.title,
      sub: o.sub,
      primaryT: o.primaryT,
      pBg: o.danger ? "#B42318" : o.dark ? "#0A1B2A" : "#12A150",
      note: o.note,
      fields: [...(o.reason ? [F("reason", o.reasonL ?? "Reason", "text", { req: true, af: true })] : []), ...(o.isLive ? liveF() : [])],
      onSubmit: async (v) => {
        if (o.isLive && !isLive(v)) return "Confirm that this is a live money action.";
        const m = await o.fn(sv(v, "reason"), true);
        await after(m || "Done.");
      },
    });

  // ── payment request wizard ─────────────────────────────────────────────
  const STEPS = ["Recipient", "Link context", "Amount", "Details", "Methods", "Customer experience", "Review", "Create"];
  async function wizard(step: number, d: Record<string, string | string[]>): Promise<void> {
    const env = st.getState().env;
    const steps = STEPS.map((t, i) => ({ t: `${i + 1}. ${t}`, fg: i === step ? "#0E8442" : i < step ? "#344054" : "#98A2B3", fw: i === step ? 800 : 600 }));
    const back = step > 0 ? () => void wizard(step - 1, d) : null;
    const cur = (d.cur as string) || boot?.business.currency || "USD";
    let fields: MField[] = [];
    try {
      if (step === 0) {
        const cs = await payApi.customers("");
        fields = [
          F("cus", "Customer (CRM lookup)", "select", { req: true, af: true, value: (d.cus as string) ?? "", options: [{ v: "", t: cs.length ? "Choose a customer…" : "No customers yet — add one in Customers" }, ...cs.map((c) => ({ v: c.id, t: `${c.name}${c.tags.length ? ` · ${c.tags.join(", ")}` : ""}${!c.hasPhone && !c.hasEmail ? " · no contact" : ""}` }))] }),
          F("contact", "Send to", "select", { value: (d.contact as string) || "whatsapp", options: O([["whatsapp", "WhatsApp · via Unified Inbox"], ["sms", "SMS · via Unified Inbox"], ["email", "Email · via Unified Inbox"], ["none", "Don’t send — I’ll share the link"]]), help: "Contact details come from Customers and aren’t copied here." }),
        ];
      } else if (step === 1) {
        const lo = await payApi.linkOptions(d.cus as string);
        const opts = Object.entries(lo).flatMap(([t, list]) => list.map((x) => ({ v: `${t}|${x.id}`, t: `${t} ${x.ref}${x.amount != null ? ` · ${x.amount.toFixed(2)} open` : ""}` })));
        fields = [F("link", "Link to", "select", { value: (d.link as string) ?? "", options: [{ v: "", t: "Nothing — standalone request" }, ...opts], help: opts.length ? "Open invoices, orders, upcoming bookings and the credit balance of this customer. Invoices are created in Orders — this only links to one." : "This customer has nothing open to link — a standalone request is fine." })];
      } else if (step === 2) {
        fields = [
          F("type", "Amount type", "select", { value: (d.type as string) || "Fixed", options: O(["Fixed", ...(boot?.policy.partialPayments ? ["Flexible"] : [])]) }),
          F("amt", "Amount (leave blank for flexible)", "number", { value: (d.amt as string) ?? "", af: true, help: `Between ${boot?.policy.minRequest} and ${boot?.policy.maxRequest} ${boot?.business.currency}` }),
          F("cur", "Currency", "select", { value: cur, options: O([...new Set([boot?.business.currency ?? "USD", ...(boot?.branches.map((b) => b.currency) ?? [])])]) }),
          F("partial", "Partial payments", "select", { value: (d.partial as string) ?? "", options: O([["", "No — pay in full"], ...(boot?.policy.partialPayments ? ([["1", "Allow partial payments"]] as [string, string][]) : [])]) }),
        ];
      } else if (step === 3) {
        const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        fields = [
          F("desc", "Description (customer sees this)", "text", { req: true, af: true, value: (d.desc as string) ?? "" }),
          F("ref", "Reference / memo", "text", { value: (d.ref as string) ?? "" }),
          F("due", "Due date", "date", { value: (d.due as string) || due, req: true }),
          F("exp", "Expires after (days)", "number", { value: (d.exp as string) || String(boot?.policy.requestExpiryDays ?? 14) }),
        ];
      } else if (step === 4) {
        const ms = await payApi.reqMethods(env, cur);
        const chosen = (d.methods as string[]) ?? ms.map((m) => m.method);
        fields = [F("methods", "Allowed methods (from Methods & Routing)", "checks", { options: ms.map((m) => ({ v: m.method, t: `${m.method} · ${m.provider === "manual" ? "instructions, recorded by your team" : "Stripe"}`, on: chosen.includes(m.method) })), help: ms.length ? "" : `No method is enabled for payment links in ${cur}${env === "test" ? " in test mode (connect Stripe — test mode)" : ""}. Enable one in Methods & Routing.` })];
      } else if (step === 5) {
        fields = [F("redirect", "Success redirect (optional)", "text", { value: (d.redirect as string) ?? "", ph: "https://your-site.com/thank-you" }), F("note", "Note shown to the customer", "area", { value: (d.note as string) ?? "" })];
      } else {
        fields = [F("sum", "Review", "read", { value: [`Recipient: ${d.cusName ?? "—"} · ${d.contact}`, `Amount: ${d.type === "Flexible" ? "Flexible (customer chooses)" : `${d.amt} ${cur}`}${d.partial ? " · partial allowed" : ""}`, `Methods: ${((d.methods as string[]) ?? []).join(", ") || "—"}`, `Due: ${d.due} · expires in ${d.exp} days`, `Linked entity: ${d.linkLabel || "None"}`, "Public link: signed opaque token, hash stored; shows only amount, description, due date and methods", env === "test" ? "Environment: TEST — no real money" : "Environment: LIVE"].join("\n") })];
      }
    } catch (e) {
      flash(errText(e));
      return;
    }
    modal({
      title: "New payment request",
      sub: `${STEPS[step]} · step ${step + 1} of 8`,
      steps,
      back,
      fields,
      primaryT: step === 6 ? "Create request" : "Next",
      note: step === 6 && env === "live" ? "Creating a request never charges anyone. Money moves only when the customer pays and the provider confirms." : null,
      onSubmit: async (v) => {
        const nd: Record<string, string | string[]> = { ...d };
        if (step === 0) {
          if (!sv(v, "cus")) return "Pick a customer.";
          nd.cus = sv(v, "cus");
          nd.contact = sv(v, "contact");
          const cs = await payApi.customers("");
          nd.cusName = cs.find((c) => c.id === nd.cus)?.name ?? "Customer";
        }
        if (step === 1) {
          nd.link = sv(v, "link");
          const form = document.getElementById("pmf_link") as HTMLSelectElement | null;
          nd.linkLabel = nd.link ? (form?.selectedOptions[0]?.text ?? "") : "";
        }
        if (step === 2) {
          nd.type = sv(v, "type");
          nd.amt = sv(v, "amt");
          nd.cur = sv(v, "cur");
          nd.partial = sv(v, "partial");
          if (nd.type === "Fixed" && !(Number(nd.amt) > 0)) return "Enter the amount.";
        }
        if (step === 3) {
          nd.desc = sv(v, "desc");
          nd.ref = sv(v, "ref");
          nd.due = sv(v, "due");
          nd.exp = sv(v, "exp");
        }
        if (step === 4) {
          nd.methods = (v.methods as string[]) ?? [];
          if (!(nd.methods as string[]).length) return "Pick at least one method.";
        }
        if (step === 5) {
          nd.redirect = sv(v, "redirect");
          nd.note = sv(v, "note");
        }
        if (step < 6) {
          void wizard(step + 1, nd);
          return "keep";
        }
        const [lt, lid] = String(nd.link || "").split("|");
        const r = await payApi.createRequest({
          env,
          customerId: nd.cus,
          contact: nd.contact,
          linkType: lt || "",
          linkId: lid || undefined,
          amountType: nd.type || "Fixed",
          amount: nd.type === "Flexible" ? undefined : Number(nd.amt),
          currency: nd.cur || cur,
          allowPartial: nd.partial === "1",
          description: nd.desc,
          reference: nd.ref || undefined,
          dueOn: nd.due || undefined,
          expiresDays: Number(nd.exp) || undefined,
          methods: nd.methods,
          note: nd.note || undefined,
          redirectUrl: nd.redirect || undefined,
          template: nd.template || undefined,
        });
        await after(`${r.number} created${nd.contact !== "none" ? " and sent through Unified Inbox" : ""}. ${r.url}`);
      },
    });
  }

  // ── modals ───────────────────────────────────────────────────────────────
  const reqAction = async (id: string, v: string) => {
    if (v === "View" || v === "Open linked entity") return open("req", id);
    if (v === "Public link preview") return open("preview", id);
    if (v === "Copy link") return run(async () => { const r = await payApi.reqLink(id); await copy(r.url, "Copied"); });
    if (v === "Share" || v === "Send") {
      const r = await payApi.reqLink(id).catch(() => null);
      return modal({
        title: "Share request",
        sub: r?.url,
        primaryT: "Share",
        note: "Messages are sent and stored by Unified Inbox. Payments keeps only the delivery reference.",
        fields: [F("how", "How", "select", { options: O([["whatsapp", "Send via Unified Inbox · WhatsApp"], ["sms", "Send via Unified Inbox · SMS"], ["email", "Send via Unified Inbox · Email"], ["copy", "Copy link"], ["qr", "Show QR code"]]) })],
        onSubmit: async (vals) => {
          const how = sv(vals, "how");
          if (how === "copy") { await copy(r?.url ?? "", "Copied"); return; }
          if (how === "qr") { void reqAction(id, "QR code"); return "keep"; }
          const s = await payApi.sendRequest(id, how);
          await after(`Handed to Unified Inbox (${s.channel}).`);
        },
      });
    }
    if (v === "QR code") {
      const r = await payApi.reqLink(id);
      return modal({
        title: "QR code",
        primaryT: "Download PNG",
        cancel: "Close",
        fields: [F("qr", "Scan to pay", "qr", { value: r.url }), F("u", "Encodes", "read", { value: `${r.url}\nOpaque token — scanning never reveals the request or customer ID.` })],
        onSubmit: async () => {
          const svg = document.getElementById("pay-qr") as SVGSVGElement | null;
          if (!svg) return "QR not ready.";
          const xml = new XMLSerializer().serializeToString(svg);
          const img = new Image();
          await new Promise<void>((res) => { img.onload = () => res(); img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`; });
          const c = document.createElement("canvas");
          c.width = 600; c.height = 600;
          const g = c.getContext("2d")!;
          g.fillStyle = "#fff"; g.fillRect(0, 0, 600, 600); g.drawImage(img, 0, 0, 600, 600);
          const a = document.createElement("a");
          a.href = c.toDataURL("image/png"); a.download = "payment-link-qr.png"; a.click();
        },
      });
    }
    if (v === "Record payment") {
      return modal({
        title: "Record a payment",
        sub: "For money that arrived outside a provider (cash, bank transfer). It is written to the linked Order, Booking or Credit balance too.",
        primaryT: "Record payment",
        fields: [F("amount", "Amount received", "number", { req: true, af: true }), F("method", "How it was paid", "select", { options: O([["cash", "Cash"], ["online", "Bank transfer / other online"], ["card", "Card on a terminal outside Noxtill"]]) }), F("reference", "Reference (bank ref, receipt no.)"), F("note", "Note", "area")],
        onSubmit: async (vals) => {
          const r = await payApi.recordPayment(id, { amount: Number(sv(vals, "amount")), method: sv(vals, "method"), reference: sv(vals, "reference") || undefined, note: sv(vals, "note") || undefined });
          await after(`Recorded as ${r.number}.`);
        },
      });
    }
    if (v === "Expire") return confirm({ title: "Expire this request?", sub: "The link stops accepting new payments immediately.", primaryT: "Expire link", danger: true, note: "Anything already captured stays captured — expiring never reverses a payment.", fn: async () => { await payApi.expireRequest(id); return "Request expired; the old link no longer works."; } });
    if (v === "Duplicate") {
      const d = await payApi.reqDuplicate(id);
      return void wizard(0, { cus: d.cus as string, contact: d.contact as string, type: d.type as string, amt: d.amt as string, cur: d.cur as string, partial: d.partial as string, desc: d.desc as string, ref: d.ref as string, exp: d.exp as string, methods: d.methods as string[], note: d.note as string, redirect: d.redirect as string });
    }
  };

  const rcvAction = async (id: string, v: string) => {
    if (v === "Open" || v === "Open transaction") return open("rcv", id);
    if (v === "Retry now") return modal({ title: "Retry payment", sub: liveNote(), primaryT: "Retry Payment", pBg: live() ? "#0A1B2A" : "#12A150", fields: [F("sum", "What happens", "read", { value: "Stripe pays the open subscription invoice with the saved method, using an idempotency key — it can’t double-charge. Hard declines and risk blocks are refused." }), ...liveF()], onSubmit: async (vals) => { if (!isLive(vals)) return "Confirm the live action."; const r = await payApi.rcvRetry(id, true); await after(r.paid ? "Provider confirmed — recovered." : "Retry sent; the provider declined again."); } });
    if (v === "Send customer update" || v === "Request new payment method") {
      const method = v === "Request new payment method";
      const dr = await payApi.rcvDraft(id, method).catch(() => ({ text: "", source: "" }));
      return modal({ title: method ? "Request a new payment method" : "Send customer update", sub: `Hands off to Unified Inbox · ${dr.source === "AI" ? "AI drafted the wording from the case facts" : "wording built from the case facts"}`, primaryT: "Hand off to Unified Inbox", fields: [F("ch", "Channel", "select", { options: O([["whatsapp", "WhatsApp"], ["sms", "SMS"], ["email", "Email"]]) }), F("txt", "Message", "area", { rows: 5, value: dr.text })], note: "The secure link replaces {secure_link} at send time. Card details are never requested in chat.", onSubmit: async (vals) => { const r = await payApi.rcvNotify(id, { channel: sv(vals, "ch"), text: sv(vals, "txt"), method }); await after(`Handed to Unified Inbox (${r.channel}).`); } });
    }
    if (v === "Pause recovery" || v === "Resume recovery") return run(async () => { await payApi.rcvOp(id, v === "Pause recovery" ? "pause" : "resume"); return v === "Pause recovery" ? "Recovery paused." : "Recovery resumed."; });
    if (v === "Mark unrecoverable") return confirm({ title: "Mark unrecoverable?", sub: "The source stays unpaid in its own module.", primaryT: "Mark unrecoverable", danger: true, reason: true, fn: async (reason) => { await payApi.rcvOp(id, "unrecoverable", reason); return "Marked unrecoverable."; } });
    if (v === "Open customer") return ext("/customers");
    if (v === "Open invoice / order") return ext("/orders");
  };

  const rfAction = async (id: string, v: string) => {
    if (v === "Open" || v === "Open payment") return open("rf", id);
    if (v === "Execute refund" || v === "Retry execution")
      return modal({ title: v === "Execute refund" ? "Execute refund" : "Retry refund", sub: liveNote(), primaryT: "Execute Refund", pBg: live() ? "#0A1B2A" : "#12A150", fields: [F("amt", "Refund amount (leave blank for the approved amount)", "number", { help: "Can’t exceed the approved amount or the remaining refundable balance (checked server-side)." }), ...liveF()], onSubmit: async (vals) => { if (!isLive(vals)) return "Confirm the live action."; const r = await payApi.rfExecute(id, sv(vals, "amt") ? Number(sv(vals, "amt")) : null, true); await after(`${r.number}: ${r.status}${r.failure ? ` · ${r.failure}` : ""}`); } });
    if (v === "Approve & execute") return confirm({ title: "Approve and execute this refund?", primaryT: "Approve & execute", dark: true, isLive: live(), fn: async () => { const r = await payApi.rfApprove(id, true); return `${r.number}: ${r.status}${r.failure ? ` · ${r.failure}` : ""}`; } });
    if (v === "View approval") return open("approvals", "_");
    if (v === "Refresh status") return run(async () => `Provider state: ${(await payApi.rfRefresh(id)).status}`);
    if (v === "Mark refunded outside Noxtill") return confirm({ title: "Mark refunded outside Noxtill", sub: "Use when the money went back at the counter or on a terminal Noxtill doesn’t control.", primaryT: "Mark refunded", reason: true, reasonL: "Payout reference (receipt, drawer, terminal ref)", fn: async (reason) => { await payApi.rfOutside(id, reason); return "Refund recorded as paid out."; } });
    if (v === "Open source refund") return ext("/orders/returns");
  };

  const dspAction = async (id: string, v: string) => {
    if (v === "Open case" || v === "Open transaction") return open("dsp", id);
    if (v === "Collect evidence") {
      const c = await payApi.dspCandidates(id);
      return modal({ title: "Collect evidence", sub: "Only real Noxtill records can be attached. Nothing is generated.", primaryT: "Add selected", fields: [F("ev", "Available records", "checks", { options: c.available.map((a) => ({ v: a.key, t: a.label })) }), ...(c.missing.length ? [F("na", "Not available in Noxtill", "read", { value: c.missing.map((m) => `✕ ${m}`).join("\n") })] : [])], onSubmit: async (vals) => { const r = await payApi.dspEvidence(id, (vals.ev as string[]) ?? []); await after(`${r.added} record(s) added.`); } });
    }
    if (v === "Submit response") {
      const c = await payApi.dspCandidates(id);
      return modal({ title: "Submit dispute response", sub: "Providers accept one response — it can’t be edited after submission.", primaryT: "Submit to provider", pBg: "#0A1B2A", fields: [F("resp", "Final response", "area", { rows: 7, req: true, value: c.response }), ...(c.missingRequired.length ? [F("anyway", `Missing evidence: ${c.missingRequired.join(", ")}`, "select", { options: O([["", "Don’t submit until complete"], ["1", "Submit anyway — I accept the weaker case"]]) })] : []), ...liveF()], onSubmit: async (vals) => { if (!isLive(vals)) return "Confirm the live action."; const r = await payApi.dspSubmit(id, sv(vals, "resp"), sv(vals, "anyway") === "1", true); await after(r.status === "Approval Required" ? "Sent to the Owner for approval (Action Center)." : "Submitted to Stripe — Under Review."); } });
    }
    if (v === "Accept dispute") return confirm({ title: "Accept this dispute?", sub: "You concede the disputed amount and fee. This can’t be undone.", primaryT: "Accept dispute", danger: true, reason: true, isLive: live(), fn: async (reason) => { await payApi.dspAccept(id, reason, true); return "Dispute accepted at Stripe."; } });
    if (v === "Assign") return modal({ title: "Assign dispute", primaryT: "Assign", fields: [F("who", "Owner", "select", { options: (boot?.members ?? []).map((m) => ({ v: m.id, t: m.name })) })], onSubmit: async (vals) => { await payApi.dspAssign(id, sv(vals, "who")); await after("Assigned."); } });
    if (v === "Approve submission") return confirm({ title: "Approve dispute submission?", primaryT: "Approve & submit", dark: true, isLive: live(), fn: async () => { await payApi.dspApprove(id, true); return "Approved and submitted to Stripe."; } });
    if (v === "ai") return run(async () => { const r = await payApi.dspDraft(id); return `${r.source === "AI" ? "AI drafted" : "Built"} a response from real records. Nothing submitted.`; });
  };

  const mndAction = async (id: string, v: string) => {
    if (v === "Open") return open("mnd", id);
    if (v === "Open source plan") return ext("/customers");
    if (v === "Pause collection" || v === "Resume") return run(async () => { await payApi.mandate(id, v === "Resume" ? "resume" : "pause"); return v === "Resume" ? "Collection resumed." : "Collection paused at Stripe."; });
    if (v === "Retry") return confirm({ title: "Retry collection?", sub: liveNote(), primaryT: "Retry", dark: true, isLive: live(), fn: async () => { const r = await payApi.mandate(id, "retry", { liveConfirm: true }); return r.paid ? "Collected — provider confirmed." : "Retry sent; provider declined."; } });
    if (v === "Request new payment method") return run(async () => { const r = await payApi.mandate(id, "method"); return `Handed to Unified Inbox (${r.channel}).`; });
    if (v === "Cancel mandate") return confirm({ title: "Cancel mandate?", sub: "Stops future collections. The plan’s entitlement is managed in its own module.", primaryT: "Cancel mandate", danger: true, reason: true, fn: async (reason) => { await payApi.mandate(id, "cancel", { reason }); return "Mandate cancelled at Stripe."; } });
  };

  const routeTest = (method?: string) =>
    modal({
      title: "Test route",
      sub: "Shows which provider would handle a payment. Nothing is charged.",
      primaryT: "Test",
      fields: [
        F("channel", "Channel", "select", { value: "Payment Link", options: O(["POS", "Website", "Payment Link", "Customer Portal", "Recurring"]) }),
        F("branch", "Branch", "select", { options: (boot?.branches ?? []).map((b) => ({ v: b.id, t: b.name })) }),
        F("country", "Country", "text", { value: boot?.business.country ?? "", req: true }),
        F("currency", "Currency", "text", { value: boot?.business.currency ?? "", req: true }),
        F("amount", "Amount", "number", { value: "100", req: true }),
        F("method", "Method", "select", { value: method ?? "Card", options: O(["Card", "Wallet", "Mobile wallet", "Bank transfer", "Cash", "Online"]) }),
      ],
      onSubmit: async (vals) => {
        const r = await payApi.routeTest({ channel: sv(vals, "channel"), branch: sv(vals, "branch"), country: sv(vals, "country").toUpperCase(), currency: sv(vals, "currency").toUpperCase(), amount: Number(sv(vals, "amount")), method: sv(vals, "method") });
        modal({
          title: r.err ? r.err : `Routes to ${r.chosen}`,
          sub: "Test route · no payment executed",
          primaryT: "Test another",
          cancel: "Close",
          fields: [F("res", "Result", "read", { value: r.err ? r.why : [`Chosen provider: ${r.chosen}`, `Why: ${r.why}`, `Matched rule: ${r.rule ? `${r.rule.name} (v${r.rule.v})` : "Method default"}`, `Fallback: ${r.fb ?? "None — fail closed"}`, `Your effective fee: ${r.feeRate == null ? "not reported yet" : `${r.feeRate.toFixed(2)}%`}`, `Settlement: ${r.settle}`].join("\n") }), ...(r.steps?.length ? [F("steps", "Evaluation order", "read", { value: r.steps.join("\n") })] : [])],
          onSubmit: async () => { routeTest(method); return "keep"; },
        });
        return "keep";
      },
    });

  const ruleModal = async (id: string | null) => {
    const r = id ? await payApi.getRule(id) : null;
    const c = (r?.conditions ?? {}) as Record<string, string | number | null>;
    const provs = O([["stripe", "Stripe"], ["manual", "Cash / manual"], ["square", "Square (read-only)"], ["paypal", "PayPal (read-only)"]]);
    modal({
      title: r ? `Edit rule · v${r.version}` : "Create routing rule",
      sub: "Precedence: Branch › Channel › Country / currency › Global default",
      primaryT: "Preview impact",
      fields: [
        F("name", "Rule name", "text", { req: true, af: true, value: r?.name ?? "" }),
        F("level", "Level", "select", { value: r?.level ?? "Channel", options: O(["Branch", "Channel", "Country / currency", "Global default"]) }),
        F("pr", "Priority within level", "number", { value: String(r?.priority ?? 5) }),
        F("method", "Method", "select", { value: r?.method ?? "Card", options: O(["Card", "Wallet", "Bank transfer", "Cash", "Online"]) }),
        F("branch", "Branch", "select", { value: String(c.branch ?? ""), options: [{ v: "", t: "Any" }, ...(boot?.branches ?? []).map((b) => ({ v: b.id, t: b.name }))] }),
        F("channel", "Channel", "select", { value: String(c.channel ?? ""), options: O([["", "Any"], "POS", "Website", "Payment Link", "Customer Portal", "Recurring"]) }),
        F("country", "Country (2 letters)", "text", { value: String(c.country ?? "") }),
        F("currency", "Currency (3 letters)", "text", { value: String(c.currency ?? "") }),
        F("min", "Min amount", "number", { value: c.minAmount ? String(c.minAmount) : "" }),
        F("max", "Max amount", "number", { value: c.maxAmount ? String(c.maxAmount) : "" }),
        F("pri", "Primary provider", "select", { value: r?.primary ?? "stripe", options: provs }),
        F("fb", "Fallback provider", "select", { value: r?.fallback ?? "", options: [{ v: "", t: "None — fail closed" }, ...provs] }),
        F("health", "Use fallback when", "read", { value: "Primary provider unavailable or timing out. Never on a customer decline." }),
      ],
      onSubmit: async (vals) => {
        const body = { name: sv(vals, "name"), level: sv(vals, "level"), priority: Number(sv(vals, "pr")) || 0, method: sv(vals, "method"), primary: sv(vals, "pri"), fallback: sv(vals, "fb") || undefined, conditions: { branch: sv(vals, "branch") || null, channel: sv(vals, "channel") || null, country: sv(vals, "country").toUpperCase() || null, currency: sv(vals, "currency").toUpperCase() || null, minAmount: sv(vals, "min") ? Number(sv(vals, "min")) : null, maxAmount: sv(vals, "max") ? Number(sv(vals, "max")) : null } };
        const I = await payApi.impact({ method: body.method, channel: body.conditions.channel ?? undefined, branch: body.conditions.branch ?? undefined, currency: body.conditions.currency ?? undefined });
        modal({
          title: "Change impact preview",
          sub: body.name,
          primaryT: "Apply change",
          pBg: I.high ? "#0A1B2A" : "#12A150",
          fields: [F("imp", "Impact", "read", { value: [`Method: ${body.method}`, `Channel: ${body.conditions.channel ?? "Any"}`, `Last 30 days on this route: ${I.n} payments · ${I.v.toFixed(2)} ${boot?.business.currency}`, `Share of collections: ${(I.share * 100).toFixed(1)}%`, `Risk: ${I.high ? "HIGH — a large share of money flows here" : "Normal"}`, "Routing decides the provider for payment links and the /pay page."].join("\n") }), F("reason", "Reason", "text", { req: I.high })],
          onSubmit: async (v2) => { await payApi.saveRule(id, { ...body, reason: sv(v2, "reason") || undefined }); await after(id ? "Rule saved as a new version." : "Rule created."); },
        });
        return "keep";
      },
    });
  };

  const methodAction = async (method: string, v: string) => {
    if (v === "Test route") return routeTest(method);
    if (v === "Enable" || v === "Disable" || v === "Preview impact") {
      const I = await payApi.impact({ method });
      return modal({ title: v === "Preview impact" ? `Impact · ${method}` : `${v} ${method}?`, primaryT: v === "Preview impact" ? "Close" : `${v} method`, pBg: I.high ? "#0A1B2A" : "#12A150", fields: [F("imp", "Impact", "read", { value: [`Last 30 days: ${I.n} payments · ${I.v.toFixed(2)} ${boot?.business.currency}`, `Share of collections: ${(I.share * 100).toFixed(1)}%`, "Payment links and the /pay page follow this matrix; the counter keeps every method so sales are never blocked."].join("\n") })], onSubmit: async () => { if (v === "Preview impact") return; await payApi.setMethod(method, { enabled: v === "Enable" }); await after(`${method} ${v === "Enable" ? "enabled" : "disabled"}.`); } });
    }
    if (v === "Change primary / fallback") {
      const provs = O([["stripe", "Stripe"], ["manual", "Cash / manual"], ["square", "Square (read-only)"], ["paypal", "PayPal (read-only)"]]);
      return modal({ title: `Primary & fallback · ${method}`, primaryT: "Save", fields: [F("pri", "Primary", "select", { options: provs }), F("fb", "Fallback", "select", { options: [{ v: "", t: "None" }, ...provs] }), F("min", "Min amount", "number"), F("max", "Max amount", "number")], onSubmit: async (vals) => { await payApi.setMethod(method, { primary: sv(vals, "pri"), fallback: sv(vals, "fb"), ...(sv(vals, "min") ? { minAmount: Number(sv(vals, "min")) } : {}), ...(sv(vals, "max") ? { maxAmount: Number(sv(vals, "max")) } : {}) }); await after("Method routing saved."); } });
    }
  };

  const recAction = async (id: string, v: string) => {
    if (v === "Open") return open("rec", id);
    if (v === "Manual match" || v === "Confirm suggested match") {
      const cands = await payApi.reconCands(id);
      return modal({ title: v, primaryT: "Match", note: cands.length ? "Confidence: High = same reference · Medium = amount + time · Low = amount only (needs your confirmation)." : "No unmatched Noxtill payments in the same currency within ±4 days.", fields: [F("cand", "Candidate Noxtill transaction", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...cands.map((c) => ({ v: c.id, t: `${c.number} · ${c.amount.toFixed(2)} ${c.currency} · ${new Date(c.at).toLocaleString()} · ${c.conf}` }))] }), F("reason", "Resolution reason", "text", { req: true }), F("low", "Low-confidence confirmation", "select", { options: O([["", "Not needed / not confirmed"], ["1", "I checked the receipt and confirm this match"]]) })], onSubmit: async (vals) => { await payApi.reconOp(id, "match", { txId: sv(vals, "cand"), reason: sv(vals, "reason"), confirmLow: sv(vals, "low") === "1" }); await after("Matched."); } });
    }
    if (v === "Split match") {
      const cands = await payApi.reconCands(id);
      return modal({ title: "Split match", primaryT: "Split match", note: "Selected payments must add up exactly to the provider line.", fields: [F("ids", "Noxtill payments", "checks", { options: cands.map((c) => ({ v: c.id, t: `${c.number} · ${c.amount.toFixed(2)} ${c.currency}` })) }), F("reason", "Reason", "text", { req: true, value: "Provider reports one line for several payments" })], onSubmit: async (vals) => { await payApi.reconOp(id, "split", { txIds: vals.ids, reason: sv(vals, "reason") }); await after("Split-matched."); } });
    }
    if (v === "Mark provider adjustment") return modal({ title: "Mark provider adjustment", primaryT: "Record adjustment", note: "Recorded and sent to Finance as an accounting input. Finance decides the entry.", fields: [F("type", "Adjustment type", "select", { options: O(["Rounding / FX", "Fee correction", "Provider-side sale", "Chargeback fee", "Other"]) }), F("reason", "Reason", "text", { req: true, af: true })], onSubmit: async (vals) => { await payApi.reconOp(id, "adjust", { type: sv(vals, "type"), reason: sv(vals, "reason") }); await after("Adjustment recorded."); } });
    if (v === "Send to Finance review") return confirm({ title: "Flag for Finance review?", primaryT: "Flag", reason: true, fn: async (reason) => { await payApi.reconOp(id, "finance", { reason }); return "Flagged for Finance (outbox event)."; } });
    if (v === "Ignore with reason") return confirm({ title: "Ignore this item?", sub: "Ignored items stay visible in the resolution log.", primaryT: "Ignore", reason: true, fn: async (reason) => { await payApi.reconOp(id, "ignore", { reason }); return "Ignored."; } });
  };

  const txAction = async (id: string, v: string) => {
    if (v === "Open" || v === "Open source entity") return open("tx", id);
    if (v === "Copy reference") return copy(rowOf("tx", id)?.cells[0]?.t ?? id, "Copied");
    if (v === "Send receipt") return run(async () => `Receipt handed to Unified Inbox (${(await payApi.receipt(id)).channel}).`);
    if (v === "Refresh provider state") return run(async () => { const r = await payApi.txRefresh(id); return r.note || `Provider state: ${r.status}${r.changed ? " (updated)" : " (unchanged)"}`; });
    if (v === "Capture") return modal({ title: "Capture payment", sub: liveNote(), primaryT: "Capture", pBg: live() ? "#0A1B2A" : "#12A150", fields: [F("amt", "Capture amount (blank = full authorization)", "number", { help: "Partial capture releases the rest." }), ...liveF()], onSubmit: async (vals) => { if (!isLive(vals)) return "Confirm the live action."; const r = await payApi.capture(id, sv(vals, "amt") ? Number(sv(vals, "amt")) : null, true); if (!r.ok) return r.note; await after(`Captured · ${r.note}`); } });
    if (v === "Open recovery") return go("recovery");
  };

  const rowAction = (bid: string, id: string, v: string) => {
    if (bid === "ov-ex") {
      const [, kind, rid] = id.split(":");
      const map: Record<string, string> = { rcv: "rcv", po: "po", rec: "rec", rf: "rf", dsp: "dsp", tx: "tx", prov: "fresh", hold: "fresh" };
      return open(map[kind] ?? "fresh", rid);
    }
    if (bid === "tx") return void txAction(id, v);
    if (bid === "rq") return void reqAction(id, v).catch((e) => flash(errText(e)));
    if (bid === "rcv") return void rcvAction(id, v).catch((e) => flash(errText(e)));
    if (bid === "rf") return void rfAction(id, v).catch((e) => flash(errText(e)));
    if (bid === "dsp") return void dspAction(id, v).catch((e) => flash(errText(e)));
    if (bid === "po") {
      if (v === "Refresh provider status") return run(async () => { const r = await payApi.refresh(); return r.errors.length ? `Refreshed with issues: ${r.errors[0]}` : "Payouts refreshed from Stripe."; });
      if (v === "Export settlement report") return run(async () => `Downloaded ${await payDownload({ what: "payout", payout: id, format: "csv", env: st.getState().env })}`);
      if (v === "Open Finance bank reconciliation") return ext("/finance/bank-feeds");
      return open("po", id);
    }
    if (bid === "mnd") return void mndAction(id, v).catch((e) => flash(errText(e)));
    if (bid === "mth") return void methodAction(id, v).catch((e) => flash(errText(e)));
    if (bid === "rule") {
      if (v === "Test with this rule") return routeTest();
      if (v === "Edit") return void ruleModal(id).catch((e) => flash(errText(e)));
      const a = { "Move up": "up", "Move down": "down", Enable: "enable", Disable: "disable" }[v];
      if (a) return run(async () => { await payApi.ruleAction(id, a); return `Rule ${a === "up" || a === "down" ? "moved" : `${a}d`} (new version).`; });
    }
    if (bid === "rec") return void recAction(id, v).catch((e) => flash(errText(e)));
  };

  // ── header / block buttons ──────────────────────────────────────────────
  const setEnv = (env: string) => {
    const s = st.getState();
    if (env === s.env) return;
    const doIt = () => { st.getState().set({ env, sel: [], page: {}, drawer: null }); flash(env === "test" ? "TEST MODE — sandbox data only. Nothing here touches live totals." : "Live."); };
    if (env === "live" && boot?.policy.liveConfirm) return modal({ title: "Switch to LIVE?", sub: "Live shows real customer payments. Actions will move real money.", primaryT: "Switch to Live", pBg: "#0A1B2A", fields: [], onSubmit: async () => doIt() });
    doIt();
  };

  const exportModal = () =>
    modal({
      title: "Export",
      sub: "Exports are logged. Card data is never exported.",
      primaryT: "Download",
      fields: [
        F("what", "What", "select", { value: st.getState().tab === "payouts" ? "payouts" : st.getState().tab === "reconciliation" ? "reconciliation" : "transactions", options: O([["transactions", "Transactions"], ["payouts", "Settlement report (payouts)"], ["reconciliation", "Provider reconciliation"]]) }),
        F("fmt", "Format", "select", { options: O([["csv", "CSV"], ["xlsx", "XLSX"]]) }),
        F("scope", "Rows", "select", { options: O([["view", "Current view"], ["sel", `Selected rows (${st.getState().sel.length})`]]) }),
        F("pii", "Customer data", "select", { options: O(boot?.actor.role === "Owner" ? [["mask", "Masked"], ["full", "Full (Owner)"]] : [["mask", "Masked (required for your role)"]]) }),
      ],
      onSubmit: async (vals) => {
        const s = scopeOf(st.getState());
        const name = await payDownload({ ...s, what: sv(vals, "what"), format: sv(vals, "fmt"), ids: sv(vals, "scope") === "sel" ? st.getState().sel.join(",") : undefined, full: sv(vals, "pii") === "full" ? "1" : undefined });
        await after(`Downloaded ${name}.`);
      },
    });

  const top = (k: string) => {
    const s = st.getState();
    if (k === "newreq") return void wizard(0, {});
    if (k === "export" || k === "bk-export") return exportModal();
    if (k === "audit") return open("audit", "_");
    if (k === "fresh") return open("fresh", "_");
    if (k === "ai") return open("ai", "_");
    if (k === "approvals") return open("approvals", "_");
    if (k === "help") return open("help", "_");
    if (k === "saveview")
      return modal({ title: "Save current view", primaryT: "Save view", fields: [F("name", "View name", "text", { req: true, af: true })], onSubmit: async (v) => { await payApi.saveView(sv(v, "name"), s.f.ov ?? {}); await after("View saved."); } });
    if (k === "rt-test") return routeTest();
    if (k === "rt-new") return void ruleModal(null);
    if (k === "rcn-auto") return run(async () => `Auto match ran — ${(await payApi.reconAuto()).created} new item(s).`);
    if (k === "env-toggle") return setEnv(s.env === "live" ? "test" : "live");
    if (k === "refresh") return run(async () => { const r = await payApi.refresh(); return r.errors.length ? `Refreshed with issues: ${r.errors[0]}` : "Providers, sources and reconciliation refreshed."; });
    if (k.startsWith("go:")) return go(k.slice(3));
    if (k.startsWith("ext:")) return ext(k.slice(4));
    if (k.startsWith("url:")) return void window.open(k.slice(4), "_blank", "noopener");
    if (k === "pol-test") {
      const ask = (result?: string) =>
        modal({ title: "Test policy", sub: "Runs sample scenarios against the draft policy. Nothing is saved or executed.", primaryT: "Run test", fields: [F("sc", "Scenario", "select", { options: O([["refund", "Refund above the Owner threshold"], ["retry", "Retry a soft decline after 3 attempts"], ["hard", "Retry a hard decline"], ["dispute", "Submit a large dispute response"], ["request", "Payment request below the minimum"]]) }), ...(result ? [F("res", "Result", "read", { value: result })] : [])], onSubmit: async (v) => { const r = await payApi.testPolicy(sv(v, "sc"), st.getState().draft); ask(r.result); return "keep"; } });
      return ask();
    }
    if (k === "pol-reset") return st.getState().set((x) => { const d = { ...x.draft }; delete d[x.sec]; return { draft: d }; });
    if (k === "bk-refresh") return run(async () => { for (const id of s.sel) await payApi.txRefresh(id).catch(() => null); st.getState().set({ sel: [] }); return "Provider state refreshed for the selection."; });
    if (k.startsWith("clear:")) return clearF(k.slice(6));
  };

  const clearF = (b: string) => {
    const fk = F_KEY[b] ?? b;
    st.getState().set((x) => ({ f: { ...x.f, [fk]: {} }, page: {} }));
  };

  const kpiClick = (key: string) => {
    const s = st.getState();
    const [p, x] = key.split(":");
    const view = (k: string, v: string) => s.set({ view: { ...s.view, [k]: v }, page: {} });
    if (p === "m") return open("metric", x);
    if (p === "tf") return s.set({ f: { ...s.f, tx: ["Succeeded", "Pending", "Failed"].includes(x) ? { st: x } : { flag: x } }, page: {} });
    if (p === "rq") { s.set({ f: { ...s.f, rq: { st: ["open", "out", "conv"].includes(x) ? "open" : x } } }); return view("rqView", "list"); }
    if (p === "rc") { s.set({ f: { ...s.f, rcv: x === "done" ? { st: "Recovered" } : {} } }); return view("rcView", x === "rep" || x === "today" ? "tl" : x === "done" ? "contact" : "queue"); }
    if (p === "rf") return view("rfView", ["ok", "total", "lag"].includes(x) ? "hist" : x === "fail" ? "exc" : "queue");
    if (p === "ds") return view("dsView", x === "due" ? "cal" : ["won", "lost", "rate"].includes(x) ? "out" : "queue");
    if (p === "po") return view("poView", x === "delay" || x === "res" ? "exc" : x === "next" ? "cal" : x === "paid" ? "hist" : x === "fees" ? "comp" : "bal");
    if (p === "md") return view("mdView", x === "pd" ? "dun" : x === "ok" || x === "fail" ? "att" : x === "up" || x === "due" ? "sched" : "list");
    if (p === "rt") return view("rtView", x === "p" ? "prio" : x === "fb" || x === "x" ? "fb" : "matrix");
    if (p === "rn") return view("rcnView", x === "Matched" ? "matched" : x === "Resolved" ? "log" : "exc");
  };

  const drawerAct = (k: string, kind: string, id: string) => {
    if (k === "refresh" || k.startsWith("ext:") || k.startsWith("url:")) { if (k.startsWith("ext:")) st.getState().set({ drawer: null }); return top(k); }
    if (k.startsWith("mt-open:")) {
      const f = JSON.parse(k.slice(8)) as Record<string, string>;
      st.getState().set((x) => ({ f: { ...x.f, tx: f }, drawer: null }));
      return go("transactions");
    }
    if (k.startsWith("apr:")) return confirm({ title: "Approve?", primaryT: "Approve", dark: true, isLive: live(), fn: async () => { const r = await payApi.decide(k.slice(4), true); return `Approved${r.status ? ` · ${r.status}` : ""}.`; } });
    const p = k.slice(0, 3);
    const v = k.slice(3);
    const catchE = (pr: Promise<unknown> | undefined) => void pr?.catch((e) => flash(errText(e)));
    if (p === "tx:") return catchE(txAction(id, v));
    if (p === "rq:") return catchE(reqAction(id, v));
    if (p === "rc:") return catchE(rcvAction(id, v));
    if (p === "rf:") return catchE(rfAction(id, v));
    if (p === "ds:") return catchE(dspAction(id, v));
    if (p === "po:") return rowAction("po", id, v);
    if (p === "md:") return catchE(mndAction(id, v));
    if (p === "rn:") return catchE(recAction(id, v));
    return top(k);
  };

  const handlers: RenderHandlers = {
    kpiClick,
    blockAct: (k) => top(k),
    segPick: (bid, k) => {
      const s = st.getState();
      const vk = bid === "ov-chart" ? "ovChart" : bid === "tx" ? "txCols" : VIEW_KEY[s.tab];
      if (vk) s.set({ view: { ...s.view, [vk]: k }, page: {} });
    },
    setQ: (bid, v) => {
      const fk = F_KEY[bid];
      if (fk) st.getState().set((x) => ({ f: { ...x.f, [fk]: { ...(x.f[fk] ?? {}), q: v } }, page: {} }));
    },
    setF: (bid, k, v) => {
      if (k === "__view") {
        if (!v) return clearF(bid);
        return void payApi.getView(v).then((view) => st.getState().set((x) => ({ f: { ...x.f, ov: view.filters } }))).catch((e) => flash(errText(e)));
      }
      const fk = F_KEY[bid];
      if (fk) st.getState().set((x) => ({ f: { ...x.f, [fk]: { ...(x.f[fk] ?? {}), [k]: v } }, page: {}, sel: [] }));
    },
    clearF,
    pageGo: (d) => st.getState().set((x) => ({ page: { ...x.page, [x.tab]: Math.max(0, (x.page[x.tab] ?? 0) + d) } })),
    selRow: (id) => st.getState().set((x) => ({ sel: x.sel.includes(id) ? x.sel.filter((y) => y !== id) : [...x.sel, id] })),
    selAll: (ids) => st.getState().set({ sel: ids }),
    rowOpen: (bid, id) => {
      const def: Record<string, string> = { "ov-ex": "Open", tx: "Open", rq: "View", rcv: "Open", rf: "Open", dsp: "Open case", po: "Open payout", mnd: "Open", rec: "Open" };
      if (def[bid]) rowAction(bid, id, def[bid]);
    },
    rowAct: rowAction,
    cardOpen: (bid, id) => {
      if (bid === "rq") {
        const t = ({ tpl_dep: { type: "Fixed", desc: "Booking deposit", exp: "3" }, tpl_inv: { type: "Fixed", desc: "Invoice balance", exp: "14", partial: "1" }, tpl_khata: { type: "Flexible", desc: "Credit balance settlement", exp: "30" } } as Record<string, Record<string, string>>)[id];
        if (t) void wizard(0, { ...t, template: id });
        return;
      }
      if (bid === "po-bal") st.getState().set((x) => ({ view: { ...x.view, poView: "hist" } }));
    },
    calOpen: (bid, id) => open(bid === "dsp-cal" ? "dsp" : "po", id),
    sel: [],
  };

  // ── settings ─────────────────────────────────────────────────────────────
  const saveSettings = async (version: number, policy: Record<string, Record<string, unknown>>) => {
    const draft = st.getState().draft;
    const patch: Record<string, Record<string, unknown>> = {};
    const changed: string[] = [];
    for (const [sec, vals] of Object.entries(draft))
      for (const [k, v] of Object.entries(vals))
        if (JSON.stringify(policy[sec]?.[k]) !== JSON.stringify(v)) {
          patch[sec] = { ...(patch[sec] ?? {}), [k]: v };
          changed.push(`${sec}.${k}`);
        }
    if (!changed.length) return flash("Nothing changed.");
    const risky = changed.filter((c) => HIGH_RISK.includes(c));
    const save = async (reason?: string) => {
      const r = await payApi.saveSettings(version, patch, reason);
      st.getState().set({ draft: {} });
      await after(r.pending ? "High-risk change sent to the Owner for approval (Action Center)." : `Saved payment policy v${r.version}.`);
    };
    if (risky.length)
      return modal({ title: "High-risk policy change", sub: `These settings affect how money moves${st.getState().env === "live" ? " in LIVE" : ""}.`, primaryT: `Save policy v${version + 1}`, pBg: "#0A1B2A", fields: [F("ch", "Changes", "read", { value: changed.join("\n") }), F("reason", "Reason", "text", { req: true, af: true })], onSubmit: async (v) => { await save(sv(v, "reason")); } });
    st.getState().set({ busy: true });
    try {
      await save();
    } catch (e) {
      flash(errText(e));
    } finally {
      st.getState().set({ busy: false });
    }
  };

  const bannerAct = (k: string) => top(k);
  const hdrSel = (k: string, v: string) => {
    if (k === "more") return v && top(v);
    if (k === "env") return setEnv(v);
    st.getState().set({ [k]: v, page: {}, sel: [] } as never);
  };

  return useMemo(() => ({ handlers, top, drawerAct, bannerAct, hdrSel, saveSettings, go, run }), [screen, boot]); // eslint-disable-line react-hooks/exhaustive-deps
}
