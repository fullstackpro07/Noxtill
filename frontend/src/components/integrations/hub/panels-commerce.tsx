"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { removeAccountingMapping, upsertAccountingMapping } from "@/lib/accounting-ecommerce-api";
import {
  HUB_KEYS,
  fetchAccountingOverview,
  fetchAccountingTransactions,
  fetchEcommerceItems,
  fetchEcommerceOverview,
  resolveConflict,
  setSourceOfTruth,
  syncAccounting,
  type EcommerceConflict,
  type SourceOfTruth,
} from "@/lib/integrations-hub-api";
import { useSession } from "@/lib/session";
import { Bullets, CompareCard, Field, Note, PanelFrame, RowsBox, inputCss } from "./hub-chrome";
import { R, chipStyle, errorMessage, money, timeStamp, whenLabel } from "./hub-ui";
import { useIntegrations } from "./integrations-store";
import { useRefreshHub } from "./use-hub";
import { SOT_OPTIONS } from "./ecommerce-screen";

const PROVIDER_NAME: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero", shopify: "Shopify", woocommerce: "WooCommerce" };

// ── Account mapping ───────────────────────────────────────────────────────

export function AccountingMappingPanel() {
  const overview = useQuery({ queryKey: HUB_KEYS.accounting, queryFn: fetchAccountingOverview });
  const { notify } = useIntegrations();
  const refresh = useRefreshHub();
  const [category, setCategory] = useState("");
  const [account, setAccount] = useState("");
  const [tax, setTax] = useState("");
  const [error, setError] = useState<string | null>(null);
  const o = overview.data;

  const save = useMutation({
    mutationFn: () =>
      upsertAccountingMapping({
        provider: o?.provider as "quickbooks" | "xero",
        ...(category.trim() ? { productCategory: category.trim() } : {}),
        externalAccountCode: account.trim(),
        ...(tax.trim() ? { externalTaxCode: tax.trim() } : {}),
      }),
    onSuccess: () => {
      notify("Mapping saved", "Blocked sales are retried on the next sync.");
      setCategory("");
      setAccount("");
      setTax("");
      setError(null);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeAccountingMapping(id),
    onSuccess: () => {
      notify("Mapping removed", "Sales in that category are held back until they are mapped again.");
      refresh();
    },
    onError: (e) => notify("Could not remove", errorMessage(e)),
  });

  if (!o) return null;
  const name = o.provider ? PROVIDER_NAME[o.provider] : "your accounting provider";
  const blocked = o.mapping.blocked.reduce((n, b) => n + b.orders, 0);

  return (
    <PanelFrame
      kicker="Account mapping"
      title="Product category to ledger account"
      badge={blocked ? `Blocks ${blocked} sale${blocked === 1 ? "" : "s"}` : o.mapping.rows.length ? "All categories mapped" : "Not mapped yet"}
      badgeTone={blocked ? "amber" : o.mapping.rows.length ? "green" : "neutral"}
      primary={{ label: "Save mapping", disabled: !o.provider || !account.trim() || save.isPending, onClick: () => save.mutate() }}
      secondary="Close"
    >
      <RowsBox
        rows={[
          ...o.mapping.rows.map((m) => ({ label: m.category ?? "Default · every other category", value: `${m.accountCode}${m.taxCode ? ` · tax ${m.taxCode}` : ""}` })),
          ...o.mapping.blocked.map((b) => ({ label: b.category === "(none)" ? "Uncategorised products" : b.category, value: `Not mapped · blocks ${b.orders}`, tone: "neg" as const })),
        ]}
      />
      {o.mapping.rows.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {o.mapping.rows.map((m) => (
            <button key={m.id} type="button" onClick={() => remove.mutate(m.id)} disabled={remove.isPending} style={{ ...chipStyle("neutral", { height: 24, fontSize: 11 }), cursor: "pointer" }}>
              Remove {m.category ?? "default"} ✕
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Product category" hint="Leave empty to set the default that applies to every category without its own mapping.">
          <input list="hub-blocked-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Beverages (empty = default)" style={inputCss} />
          <datalist id="hub-blocked-categories">
            {o.mapping.blocked.filter((b) => b.category !== "(none)").map((b) => (
              <option key={b.category} value={b.category} />
            ))}
          </datalist>
        </Field>
        <Field label={`${name} account code`}>
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="The ledger account's code or id in your accounting system" style={inputCss} />
        </Field>
        <Field label="Tax code (optional)">
          <input value={tax} onChange={(e) => setTax(e.target.value)} placeholder="Tax code to apply to these lines" style={inputCss} />
        </Field>
      </div>
      {error ? <div style={{ border: "1px solid #FBD5D2", background: "#FEF3F2", color: "#B42318", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600 }}>{error}</div> : null}
      <Bullets
        title="Why an unmapped category blocks its sales"
        items={[
          "A sale is posted using the ledger account mapped to each product's category, or your default",
          "With neither, Noxtill does not post to a nearest-guess account — a wrong ledger is worse than an unposted sale",
          "The sale itself is unaffected in Noxtill; only the accounting post is pending",
          "Saving a mapping lets the next sync post the sales it was blocking",
        ]}
      />
      <Note>Noxtill never posts to a substitute account to make a sync succeed. Mapping changes are recorded in the audit trail.</Note>
    </PanelFrame>
  );
}

// ── Accounting record ─────────────────────────────────────────────────────

export function AccountingRecordPanel({ id }: { id: string }) {
  const tx = useQuery({ queryKey: HUB_KEYS.accountingTx, queryFn: fetchAccountingTransactions });
  const overview = useQuery({ queryKey: HUB_KEYS.accounting, queryFn: fetchAccountingOverview });
  const { notify, closeOverlays } = useIntegrations();
  const refresh = useRefreshHub();
  const retry = useMutation({
    mutationFn: () => syncAccounting([id]),
    onSuccess: (r) => {
      notify(r.pushed ? "Posted" : "Still failing", r.pushed ? "The record now has an accounting reference." : (r.results[0]?.message ?? "See the reason on the record."));
      refresh();
      closeOverlays();
    },
    onError: (e) => notify("Retry did not run", errorMessage(e)),
  });
  const r = tx.data?.find((x) => x.id === id);
  if (!r || !overview.data) return null;
  const name = overview.data.provider ? PROVIDER_NAME[overview.data.provider] : "the accounting provider";
  const currency = overview.data.currency;
  const label = r.status === "posted" ? "Posted" : r.status === "failed" ? "Failed" : "Pending";
  return (
    <PanelFrame
      kicker="Accounting record"
      title={`#${r.orderNo} · Sale`}
      badge={label}
      badgeTone={r.status === "posted" ? "green" : r.status === "failed" ? "red" : "neutral"}
      primary={r.status === "failed" ? { label: "Retry", disabled: retry.isPending, onClick: () => retry.mutate() } : undefined}
      secondary="Close"
    >
      <RowsBox
        rows={[
          { label: "Date", value: timeStamp(r.date) },
          { label: "Type", value: "Sale" },
          { label: "Noxtill reference", value: `#${r.orderNo}` },
          { label: "Accounting reference", value: r.externalId ?? "—", tone: r.externalId ? "pos" : "neg" },
          { label: "Amount", value: money(r.amount, currency) },
          { label: "Ledger account", value: r.ledgerAccounts.length ? r.ledgerAccounts.join(" · ") : "Not mapped", tone: r.ledgerAccounts.length ? undefined : "neg" },
          { label: "Status", value: label },
          { label: "Direction", value: `Noxtill → ${name}` },
          { label: "Last attempted", value: r.attemptedAt ? whenLabel(r.attemptedAt) : "Not attempted yet" },
          ...(r.error ? [{ label: "Why it failed", value: r.error, tone: "neg" as const }] : []),
          { label: "Noxtill record affected", value: "No · the sale is unchanged", tone: "pos" },
        ]}
      />
      {r.lines.length > 0 ? (
        <RowsBox rows={r.lines.map((l) => ({ label: `${l.qty} × ${l.name}${l.category ? ` · ${l.category}` : ""}`, value: `${money(l.amount, currency)} → ${l.account ?? "no account"}`, tone: l.account ? undefined : ("neg" as const) }))} />
      ) : null}
      <Bullets
        title={r.externalId ? "What posting means" : "Why there is no accounting reference"}
        items={
          r.externalId
            ? ["A reference exists only after the provider confirms the post", "Noxtill never marks a record as synced before confirmation", "Both references are kept, so the record is traceable in both systems", `Reversing a post is done in ${name}, not from here`]
            : ["No accounting reference means the record has not posted", r.status === "failed" ? "The reason above is what stopped it; fix it, then retry this record" : "It is queued for the next sync", "Noxtill will not post to a substitute account to make the sync succeed", "The sale itself is complete and correct in Noxtill regardless"]
        }
      />
      <Note>Noxtill marks nothing as posted until the accounting provider confirms it.</Note>
    </PanelFrame>
  );
}

// ── Conflict resolver ─────────────────────────────────────────────────────

export function ConflictPanel({ id }: { id?: string }) {
  const items = useQuery({ queryKey: HUB_KEYS.ecommerceItems, queryFn: fetchEcommerceItems });
  const { openPanel, notify, closeOverlays } = useIntegrations();
  const refresh = useRefreshHub();
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => items.data?.conflicts ?? [], [items.data]);
  const pending = all.filter((c) => c.status === "pending");
  const current: EcommerceConflict | undefined = (id ? all.find((c) => c.id === id) : undefined) ?? pending[0];

  const resolve = useMutation({
    mutationFn: (v: { choice: "noxtill" | "store" | "custom"; qty?: number }) => resolveConflict(current!.id, v.choice, v.qty),
    onSuccess: () => {
      notify("Conflict resolved", "Your choice is recorded with who made it and when.");
      setCustom("");
      setError(null);
      refresh();
      const next = pending.find((c) => c.id !== current?.id);
      if (next) openPanel({ type: "conflict", id: next.id });
      else closeOverlays();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (!current) {
    return (
      <PanelFrame kicker="Conflict resolver" title="No stock conflicts" badge="Nothing waiting" badgeTone="green" secondary="Close">
        <Note>There are no stock differences waiting for a decision. When Noxtill and your store disagree and the source of truth is “conflicts queued”, they appear here.</Note>
      </PanelFrame>
    );
  }

  const store = PROVIDER_NAME[current.provider] ?? current.provider;
  const isPending = current.status === "pending";
  const others = pending.filter((c) => c.id !== current.id);
  const qty = Number(custom);
  const customValid = custom.trim() !== "" && Number.isInteger(qty) && qty >= 0;
  const nextOther = others[0];

  return (
    <PanelFrame
      kicker="Conflict resolver"
      title={`${current.productName ?? current.sku} · stock`}
      badge={isPending ? "Both sides changed" : `Resolved · ${current.resolution === "matched" ? "both sides agree again" : current.resolution}`}
      badgeTone={isPending ? "amber" : "green"}
      primary={isPending ? { label: customValid ? `Set both to ${qty}` : "Merge manually", disabled: !customValid || resolve.isPending, onClick: () => resolve.mutate({ choice: "custom", qty }) } : undefined}
      secondary={nextOther ? { label: "Next conflict", onClick: () => openPanel({ type: "conflict", id: nextOther.id }) } : "Close"}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
        <CompareCard
          side="Noxtill"
          tone="green"
          badge={current.localUpdatedAt ? `Updated ${whenLabel(current.localUpdatedAt)}` : undefined}
          fields={[
            { label: "Product name", value: current.productName ?? "—" },
            { label: "SKU", value: current.sku },
            { label: "Stock on hand", value: String(current.localQty), highlight: true },
          ]}
          action="Use Noxtill values"
          busy={!isPending || resolve.isPending}
          onAction={() => resolve.mutate({ choice: "noxtill" })}
        />
        <CompareCard
          side={store}
          tone="amber"
          badge={current.remoteUpdatedAt ? `Updated ${whenLabel(current.remoteUpdatedAt)}` : undefined}
          fields={[
            { label: "Product name", value: current.productName ?? "—" },
            { label: "SKU", value: current.sku },
            { label: "Stock on hand", value: String(current.remoteQty), highlight: true },
          ]}
          action={`Use ${store} values`}
          busy={!isPending || resolve.isPending}
          onAction={() => resolve.mutate({ choice: "store" })}
        />
      </div>
      {isPending ? (
        <Field label="Or set both sides to your own number" hint="The number is written to Noxtill as a recorded stock movement and pushed to the store.">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="numeric" placeholder="e.g. 24" style={inputCss} />
        </Field>
      ) : null}
      {error ? <div style={{ border: "1px solid #FBD5D2", background: "#FEF3F2", color: "#B42318", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600 }}>{error}</div> : null}
      <RowsBox
        rows={[
          { label: "Conflicting fields", value: "Stock on hand", tone: "neg" },
          { label: "Matching fields", value: "Name and SKU", tone: "pos" },
          { label: "Detected", value: timeStamp(current.detectedAt) },
          ...(isPending
            ? [
                { label: "Currently applied", value: "Neither · both sides unchanged", tone: "pos" as const },
                { label: "Other conflicts queued", value: others.length ? `${others.length} more` : "None" },
              ]
            : [{ label: "Resolved", value: `${current.resolvedAt ? timeStamp(current.resolvedAt) : "—"} · stock set to ${current.resolvedQty ?? "—"}`, tone: "pos" as const }]),
          { label: "Price", value: "Not synced · only stock is compared", tone: "muted" as const },
        ]}
      />
      <Bullets
        title="Why neither value was applied"
        items={[
          "This connection is set to queue differences instead of choosing a winner",
          "Both systems hold a different stock number for the same SKU since the last sync",
          "A difference can be sales on one side that the other has not seen yet — that is your call to make",
          "Choosing a side is recorded as a stock movement with your name",
        ]}
      />
      <Note>Noxtill never silently overwrites conflicting stock in either direction while the source of truth is “conflicts queued”.</Note>
    </PanelFrame>
  );
}

// ── Order imported from the store ─────────────────────────────────────────

export function EcomOrderPanel({ id }: { id: string }) {
  const items = useQuery({ queryKey: HUB_KEYS.ecommerceItems, queryFn: fetchEcommerceItems });
  const session = useSession();
  const router = useRouter();
  const { closeOverlays } = useIntegrations();
  const o = items.data?.orders.find((x) => x.id === id);
  if (!o) return null;
  return (
    <PanelFrame
      kicker="Order sync"
      title={`#${o.orderNo}`}
      badge="Imported"
      badgeTone="green"
      primary={{ label: "Open Orders", onClick: () => { closeOverlays(); router.push("/orders"); } }}
      secondary="Close"
    >
      <RowsBox
        rows={[
          { label: "Type", value: "Order" },
          { label: "Store", value: PROVIDER_NAME[o.provider ?? ""] ?? "—" },
          { label: "Store reference", value: o.storeRef ?? "—" },
          { label: "Noxtill reference", value: `#${o.orderNo}`, tone: "pos" },
          { label: "Total", value: money(o.total, session.business.currency) },
          { label: "Imported", value: timeStamp(o.at) },
          { label: "Direction", value: "Inbound" },
          { label: "Counted twice", value: "No · one order, one Noxtill record", tone: "pos" },
        ]}
      />
      <Bullets
        title="Where this data lands"
        items={[
          "A store order becomes exactly one Noxtill order, deduplicated by its store reference",
          "It then appears in Orders, Profit & Analytics and Reports like any other online order",
          "It never creates a customer record, a payment or a stock movement on its own",
          "Stock is reconciled separately, by SKU, using the connection's source of truth",
        ]}
      />
      <Note>The order is unchanged in the store. Noxtill only reads it.</Note>
    </PanelFrame>
  );
}

// ── Configure direction (source of truth) ──────────────────────────────────

export function SourceOfTruthPanel() {
  const overview = useQuery({ queryKey: HUB_KEYS.ecommerce, queryFn: fetchEcommerceOverview });
  const { notify, closeOverlays } = useIntegrations();
  const refresh = useRefreshHub();
  const o = overview.data;
  const first = o?.connections[0];
  const [provider, setProvider] = useState<"shopify" | "woocommerce" | null>(null);
  const [choice, setChoice] = useState<SourceOfTruth | null>(null);
  const active = o?.connections.find((c) => c.provider === (provider ?? first?.provider)) ?? first;
  const save = useMutation({
    mutationFn: () => setSourceOfTruth(active!.provider, choice ?? active!.sourceOfTruth),
    onSuccess: () => {
      notify("Source of truth changed", "Applies from the next sync. Recorded in the audit trail.");
      refresh();
      closeOverlays();
    },
    onError: (e) => notify("Could not change it", errorMessage(e)),
  });
  if (!o || !active) return null;
  const store = PROVIDER_NAME[active.provider];
  const selected = choice ?? active.sourceOfTruth;
  return (
    <PanelFrame
      kicker="Direction"
      title={`${store} stock direction`}
      badge="Applies from the next sync"
      badgeTone="blue"
      primary={{ label: "Apply", disabled: selected === active.sourceOfTruth || save.isPending, onClick: () => save.mutate() }}
      secondary="Cancel"
    >
      {o.connections.length > 1 ? (
        <div style={{ display: "flex", gap: 6 }}>
          {o.connections.map((c) => (
            <button key={c.provider} type="button" onClick={() => { setProvider(c.provider); setChoice(null); }} style={{ ...chipStyle(c.provider === active.provider ? "green" : "neutral", { height: 26, fontSize: 11 }), cursor: "pointer" }}>
              {PROVIDER_NAME[c.provider]}
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {SOT_OPTIONS.map((s) => {
          const on = selected === s.value;
          return (
            <div key={s.value} onClick={() => setChoice(s.value)} style={{ border: `1px solid ${on ? R.greenLine : R.divider}`, borderRadius: 11, padding: 12, cursor: "pointer", background: on ? "#F9FEFB" : "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.label.replace("The store", store)}</div>
                  <div style={{ fontSize: 10.5, color: R.faint, marginTop: 2, lineHeight: 1.4 }}>{s.detail(store)}</div>
                </div>
                {s.value === active.sourceOfTruth ? <span style={chipStyle("green", { height: 19, fontSize: 9 })}>Active</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      <RowsBox
        rows={[
          { label: "Fields affected", value: "Stock on hand" },
          { label: "Conflicts already waiting", value: active.pendingConflicts ? `${active.pendingConflicts} · still need a decision` : "None", tone: active.pendingConflicts ? "neg" : "pos" },
          { label: "Applied at", value: "Next sync, not immediately" },
          { label: "Not synced", value: "Prices, names and customers", tone: "muted" },
        ]}
      />
      <Note>Orders always flow one way, store → Noxtill. This setting only decides who wins when both sides hold a different stock number.</Note>
    </PanelFrame>
  );
}
