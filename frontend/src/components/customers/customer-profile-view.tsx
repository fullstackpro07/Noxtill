"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Merge, Download } from "lucide-react";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import { MergeCustomerDialog } from "./merge-customer-dialog";
import { updateCustomer, eraseCustomer, exportCustomer, fetchCustomers, type CustomerDetail } from "@/lib/customers-api";
import { fetchLedger } from "@/lib/credit-api";
import { fetchAppointments } from "@/lib/bookings-api";
import { fetchReviewRequests } from "@/lib/reviews-api";
import { fetchCustomerMessages } from "@/lib/messages-api";
import { createMemoryNote } from "@/lib/memory-notes-api";
import { fetchCustomerPrivacySettings } from "@/lib/customer-privacy-settings-api";
import { lifecycleOf, initialsFor, avatarColorFor, LIFECYCLE_TONE } from "@/lib/customer-lifecycle";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

type HistTab = "purchases" | "appts" | "reviews" | "credit" | "messages";

const HIST_TABS: { k: HistTab; label: string; managerOnly?: boolean }[] = [
  { k: "purchases", label: "Purchase History" },
  { k: "appts", label: "Appointment History" },
  { k: "reviews", label: "Reviews Left" },
  { k: "credit", label: "Credit Entries", managerOnly: true },
  { k: "messages", label: "Messages Sent" },
];

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 42 };

export function CustomerProfileView({ customer, currency }: { customer: CustomerDetail; currency: string }) {
  const session = useSession();
  const manager = session.user.role !== "staff";
  const router = useRouter();
  const queryClient = useQueryClient();
  const [eraseOpen, setEraseOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [histTab, setHistTab] = useState<HistTab>("purchases");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: privacy } = useQuery({ queryKey: ["customer-privacy-settings"], queryFn: fetchCustomerPrivacySettings, enabled: !manager });
  const canSeeCredit = manager || (privacy?.creditBalanceVisibleToStaff ?? false);
  const canExport = manager || (privacy?.staffCanExport ?? false);
  const canMerge = manager || (privacy?.staffCanMerge ?? false);
  const { data: ledger } = useQuery({ queryKey: ["ledger", customer.id], queryFn: () => fetchLedger(customer.id), enabled: canSeeCredit });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments", "all"], queryFn: () => fetchAppointments() });
  const { data: reviews = [] } = useQuery({ queryKey: ["review-requests"], queryFn: fetchReviewRequests });
  const { data: messages = [] } = useQuery({ queryKey: ["customer-messages", customer.id], queryFn: () => fetchCustomerMessages(customer.id) });

  const myAppointments = useMemo(() => appointments.filter((a) => a.customerId === customer.id), [appointments, customer.id]);
  const myReviews = useMemo(() => reviews.filter((r) => r.customerId === customer.id && r.status === "rated"), [reviews, customer.id]);

  const exportMutation = useMutation({
    mutationFn: () => exportCustomer(customer.id),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${customer.name.replace(/\s+/g, "-").toLowerCase()}-export.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't export this customer's data."),
  });

  const eraseMutation = useMutation({
    mutationFn: (confirmPhrase: string) => eraseCustomer(customer.id, confirmPhrase),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`${customer.name} erased — history anonymized, audit logged.`);
      router.push("/customers");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't erase this customer.");
      setEraseOpen(false);
    },
  });

  const lifecycle = lifecycleOf(customer);
  const tone = LIFECYCLE_TONE[lifecycle];
  const avatar = avatarColorFor(customer.id);
  const isVip = lifecycle === "VIP";

  const avgReturnDays = useMemo(() => {
    if (customer.visitCount < 2 || !customer.lastVisitAt) return null;
    const span = new Date(customer.lastVisitAt).getTime() - new Date(customer.createdAt).getTime();
    return Math.max(1, Math.round(span / (customer.visitCount - 1) / (1000 * 60 * 60 * 24)));
  }, [customer]);

  const monthlySeries = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; spend: number; visits: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: "short" }), spend: 0, visits: 0 });
    }
    for (const o of customer.orders) {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) { bucket.spend += o.total; bucket.visits += 1; }
    }
    return months;
  }, [customer.orders]);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[14px] rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full text-[16px] font-extrabold" style={{ background: avatar.bg, color: avatar.fg }}>{initialsFor(customer.name)}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-[9px]">
            <span className="text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>{customer.name}</span>
            {isVip && <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold" style={{ background: "#FEF6E7", color: "#B54708" }}>VIP</span>}
            {!customer.consentMarketing && <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>Opted out of marketing</span>}
          </span>
          <span className="mt-1 block text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{customer.phone} · customer since {formatDate(customer.createdAt)}</span>
          <span className="mt-[7px] flex flex-wrap gap-[5px]">
            {customer.tags.map((t) => (
              <span key={t} className="rounded-full px-2 py-[3px] text-[10px] font-extrabold" style={{ background: tone.bg, color: tone.fg }}>{t}</span>
            ))}
          </span>
        </span>
        <span className="ml-auto flex flex-wrap gap-[9px]">
          <a href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={outlineBtn}>WhatsApp</a>
          <button type="button" onClick={() => router.push("/bookings")} style={outlineBtn}>Book Appointment</button>
          <button type="button" onClick={() => router.push("/sales")} style={primaryBtn}>New Sale</button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <label className="text-[12px] font-bold" style={{ color: "var(--app-text-faint)" }}>VIEWING</label>
        <select
          value={customer.id}
          onChange={(e) => router.push(`/customers/${e.target.value}`)}
          aria-label="Choose customer"
          style={{ border: "1px solid var(--app-border)", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 44 }}
        >
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => setNoteOpen(true)} style={smallOutline}>Add Note</button>
          <button type="button" onClick={() => setTagsOpen(true)} style={smallOutline}>Edit Tags</button>
          {canExport && (
            <button type="button" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} style={smallOutline}><Download className="mr-1 inline h-3 w-3" aria-hidden />Export Their Data</button>
          )}
          {canMerge && (
            <button type="button" onClick={() => setMergeOpen(true)} style={smallOutline}><Merge className="mr-1 inline h-3 w-3" aria-hidden />Merge Duplicate</button>
          )}
          {manager && (
            <button type="button" onClick={() => setEraseOpen(true)} style={{ ...smallOutline, color: "#B42318" }}><Trash2 className="mr-1 inline h-3 w-3" aria-hidden />Erase Customer</button>
          )}
        </span>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(172px,1fr))" }}>
        {manager && (
          <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Lifetime Spend</div>
            <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(customer.lifetimeSpend, currency)}</div>
          </div>
        )}
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Total Visits</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{customer.visitCount}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Last Visit</div>
          <div className="mt-2 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{customer.lastVisitAt ? formatDate(customer.lastVisitAt) : "—"}</div>
        </div>
        {canSeeCredit && (
          <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Credit Balance</div>
            <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: ledger && ledger.balance > 0 ? "#B42318" : "var(--app-text)" }}>{ledger ? formatCurrency(ledger.balance, currency) : "…"}</div>
          </div>
        )}
        {manager && (
          <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Average Spend</div>
            <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(customer.visitCount ? customer.lifetimeSpend / customer.visitCount : 0, currency)}</div>
          </div>
        )}
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Average Return Interval</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{avgReturnDays ? `${avgReturnDays}d` : "—"}</div>
        </div>
      </div>

      {!manager && (
        <div className="rounded-[12px] p-[11px_14px] text-[12px]" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
          Spend is always hidden for the Staff role{!canSeeCredit ? "; credit is hidden too" : ""} — configurable in Customer Settings → Privacy &amp; staff access.
        </div>
      )}

      {manager && (
        <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
            <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Spend over time</h3>
            <MiniLineChart points={monthlySeries.map((m) => ({ label: m.label, value: m.spend }))} />
          </div>
          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
            <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Visit frequency</h3>
            <div className="flex h-[104px] items-end gap-2.5">
              {monthlySeries.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="w-full rounded-t-[5px]" style={{ height: `${Math.max((m.visits / Math.max(...monthlySeries.map((x) => x.visits), 1)) * 80, 3)}px`, background: "#C7D7FE" }} />
                  <span className="text-[10.5px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          {HIST_TABS.filter((t) => !t.managerOnly || canSeeCredit).map((t) => {
            const active = histTab === t.k;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => setHistTab(t.k)}
                className="rounded-full px-[14px] py-2 text-[12px] font-bold"
                style={{ border: `1px solid ${active ? "#0A1B2A" : "var(--app-border)"}`, background: active ? "#0A1B2A" : "var(--app-surface)", color: active ? "#fff" : "var(--app-text-muted)", minHeight: 40 }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {histTab === "purchases" && (
          customer.orders.length === 0 ? <EmptyHist text="No purchases yet." /> : (
            <TableShell headers={["Item", "Date", "Amount"]}>
              {customer.orders.map((o) => (
                <tr key={o.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                  <td className="p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>#{o.orderNo} · {o.items.map((i) => i.name).join(", ")}</td>
                  <td className="p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(o.createdAt)}</td>
                  <td className="p-[12px_17px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(o.total, currency)}</td>
                </tr>
              ))}
            </TableShell>
          )
        )}

        {histTab === "appts" && (
          myAppointments.length === 0 ? <EmptyHist text="No appointments yet." /> : (
            <TableShell headers={["Date", "Service", "Staff", "Status"]}>
              {myAppointments.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                  <td className="p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatDate(a.startsAt)}</td>
                  <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{a.serviceName}</td>
                  <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{a.staffName ?? "—"}</td>
                  <td className="p-[12px_17px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>{a.status}</span></td>
                </tr>
              ))}
            </TableShell>
          )
        )}

        {histTab === "reviews" && (
          myReviews.length === 0 ? <EmptyHist text="No reviews left yet." /> : (
            <div className="flex flex-col gap-[11px] p-[15px_17px]">
              {myReviews.map((r) => (
                <div key={r.id} className="rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
                  <div className="flex flex-wrap items-center gap-[9px]">
                    <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{r.source}</span>
                    <span className="text-[13px]" style={{ color: "#F59E0B" }}>{"★".repeat(r.stars ?? 0)}{"☆".repeat(5 - (r.stars ?? 0))}</span>
                    <span className="ml-auto text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(r.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {histTab === "credit" && canSeeCredit && (
          !ledger || ledger.entries.length === 0 ? <EmptyHist text="No credit entries yet." /> : (
            <TableShell headers={["Date", "Entry", "Amount", "Balance"]}>
              {ledger.entries.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                  <td className="p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatDate(e.date)}</td>
                  <td className="p-[12px] text-[12.5px] capitalize" style={{ color: "var(--app-text-muted)" }}>{e.kind.replace("_", " ")}</td>
                  <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: e.kind === "credit" ? "var(--app-text)" : "var(--app-primary)" }}>{e.kind === "credit" ? "+" : "−"}{formatCurrency(e.amount, currency)}</td>
                  <td className="p-[12px_17px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(e.runningBalance, currency)}</td>
                </tr>
              ))}
            </TableShell>
          )
        )}

        {histTab === "messages" && (
          messages.length === 0 ? <EmptyHist text="No messages sent yet." /> : (
            <TableShell headers={["Channel", "Date", "Template", "Status"]}>
              {messages.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                  <td className="p-[12px_17px] text-[12.5px] font-bold capitalize" style={{ color: "var(--app-text-muted)" }}>{m.channel}</td>
                  <td className="whitespace-nowrap p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(m.createdAt)} {formatTime(m.createdAt)}</td>
                  <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{m.customBody ? m.customBody.slice(0, 60) : m.templateKey}</td>
                  <td className="p-[12px_17px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold capitalize" style={{ background: m.status === "failed" ? "#FEF3F2" : "#E8F7EE", color: m.status === "failed" ? "#B42318" : "#0E8442" }}>{m.status}</span></td>
                </tr>
              ))}
            </TableShell>
          )
        )}
      </div>

      <DestructiveConfirmDialog
        open={eraseOpen}
        onClose={() => setEraseOpen(false)}
        onConfirm={() => eraseMutation.mutate(customer.phone)}
        title={`Erase ${customer.name}?`}
        description="Permanently removes personal details. Purchase history is kept, anonymized, for accounting records. This is audit-logged and cannot be undone."
        confirmPhrase={customer.phone}
        confirmLabel="Erase customer"
        pending={eraseMutation.isPending}
      />
      {mergeOpen && <MergeCustomerDialog customerId={customer.id} customerName={customer.name} onClose={() => setMergeOpen(false)} onMerged={() => setMergeOpen(false)} />}
      {noteOpen && <AddNoteDialog customerId={customer.id} onClose={() => setNoteOpen(false)} />}
      {tagsOpen && <EditTagsDialog customer={customer} onClose={() => setTagsOpen(false)} />}
    </main>
  );
}

function EmptyHist({ text }: { text: string }) {
  return (
    <div className="p-[52px_18px] text-center">
      <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>{text}</div>
    </div>
  );
}

function TableShell({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 600 }}>
        <thead>
          <tr style={{ background: "var(--app-surface-2)" }}>
            {headers.map((h, i) => (
              <th key={h} className={`p-[10px${i === 0 ? "_17px" : ""}] text-[11px] font-bold ${i === headers.length - 1 ? "text-end" : "text-start"}`} style={{ color: "var(--app-text-disabled)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function MiniLineChart({ points }: { points: { label: string; value: number }[] }) {
  const width = 620;
  const height = 140;
  const max = Math.max(...points.map((p) => p.value), 1);
  const coords = points.map((p, i) => ({ x: (i / (points.length - 1)) * (width - 8) + 4, y: height - 20 - (p.value / max) * (height - 40) }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${height - 20} L${coords[0].x},${height - 20} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }}>
      <path d={areaPath} fill="var(--app-primary)" opacity={0.1} />
      <path d={linePath} fill="none" stroke="var(--app-primary)" strokeWidth={2.4} strokeLinejoin="round" />
      {coords.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={3.4} fill="#fff" stroke="var(--app-primary)" strokeWidth={1.8} />)}
      {points.map((p, i) => (
        <text key={i} x={coords[i].x} y={height - 4} textAnchor="middle" fontSize={10.5} fill="var(--app-text-disabled)" fontWeight={600}>{p.label}</text>
      ))}
    </svg>
  );
}

function AddNoteDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createMemoryNote({ subjectType: "customer", subjectId: customerId, body: body.trim(), pinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memory-notes", "customer", customerId] });
      toast.success("Note saved.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this note."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(10,27,42,.42)" }}>
      <div className="w-[460px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Add Note</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="What should the team know?" className="w-full rounded-[11px] p-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          <label className="flex items-center gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
            <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Pin this note</span>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ accentColor: "var(--app-primary)", width: 18, height: 18 }} />
          </label>
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!body.trim() || mutation.isPending} style={primaryBtn}>{mutation.isPending ? "Saving…" : "Save Note"}</button>
        </div>
      </div>
    </div>
  );
}

function EditTagsDialog({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const [tags, setTags] = useState<string[]>(customer.tags);
  const [input, setInput] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => updateCustomer(customer.id, { tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Tags updated.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update tags."),
  });

  function addTag() {
    const t = input.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setInput("");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(10,27,42,.42)" }}>
      <div className="w-[420px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Edit Tags</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-wrap gap-[7px] p-[17px]">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} className="inline-flex min-h-[36px] items-center rounded-full px-[13px] text-[11.5px] font-bold" style={{ background: "#E8F7EE", color: "#0E8442" }}>{t} ×</button>
          ))}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            onBlur={addTag}
            placeholder="+ Add a tag…"
            aria-label="Add a tag"
            className="min-h-[36px] min-w-[110px] rounded-full px-[13px] text-[11.5px] font-bold"
            style={{ border: "1px dashed #C6CFD8", color: "var(--app-primary)" }}
          />
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={primaryBtn}>{mutation.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
