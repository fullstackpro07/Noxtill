"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff, Trash2, Plus } from "lucide-react";
import { fetchCustomers, searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { fetchSuppliers } from "@/lib/suppliers-api";
import { fetchProducts } from "@/lib/products-api";
import { fetchTables } from "@/lib/tables-api";
import { fetchStaffList } from "@/lib/staff-api";
import {
  fetchAllMemoryNotes,
  createMemoryNote,
  updateMemoryNote,
  deleteMemoryNote,
  type MemoryNoteSubjectType,
} from "@/lib/memory-notes-api";
import { fetchCustomerPrivacySettings } from "@/lib/customer-privacy-settings-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useCustomersSearchStore } from "@/store/customers-search-store";

const SUBJECT_LABEL: Record<MemoryNoteSubjectType, string> = {
  customer: "Customer",
  supplier: "Supplier",
  product: "Product",
  table: "Table",
};
const SUBJECT_TONE: Record<MemoryNoteSubjectType, { bg: string; fg: string }> = {
  customer: { bg: "#EEF4FF", fg: "#3538CD" },
  supplier: { bg: "#F5EBFE", fg: "#7E22CE" },
  product: { bg: "#E8F7EE", fg: "#0E8442" },
  table: { bg: "#FEF6E7", fg: "#B54708" },
};

interface SubjectOption { id: string; label: string }

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };

export function MemoryNotesView() {
  const session = useSession();
  const manager = session.user.role !== "staff";
  const query = useCustomersSearchStore((s) => s.query);
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"All subjects" | MemoryNoteSubjectType>("All subjects");
  const [authorFilter, setAuthorFilter] = useState("All authors");

  const { data: allNotes = [], isPending } = useQuery({ queryKey: ["memory-notes", "all"], queryFn: fetchAllMemoryNotes });
  const { data: privacy } = useQuery({ queryKey: ["customer-privacy-settings"], queryFn: fetchCustomerPrivacySettings, enabled: !manager });
  const canSeeNotes = manager || (privacy?.notesVisibleToStaff ?? true);
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });
  const { data: products = [] } = useQuery({ queryKey: ["products", "all"], queryFn: () => fetchProducts() });
  const { data: tables = [] } = useQuery({ queryKey: ["tables"], queryFn: fetchTables });
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaffList });

  const staffById = useMemo(() => new Map(staff.map((s) => [s.userId, s.name])), [staff]);
  const subjectName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) map.set(`customer:${c.id}`, c.name);
    for (const s of suppliers) map.set(`supplier:${s.id}`, s.name);
    for (const p of products) map.set(`product:${p.id}`, p.name);
    for (const t of tables) map.set(`table:${t.id}`, `Table ${t.number}`);
    return map;
  }, [customers, suppliers, products, tables]);

  const authorNames = useMemo(() => Array.from(new Set(allNotes.map((n) => n.authorUserId).filter(Boolean))).map((id) => staffById.get(id!) ?? "Unknown"), [allNotes, staffById]);

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => updateMemoryNote(id, { pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memory-notes"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this note."),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteMemoryNote,
    onSuccess: () => {
      toast.success("Note deleted.");
      queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this note."),
  });

  const filtered = useMemo(() => {
    return allNotes.filter((n) => {
      if (typeFilter !== "All subjects" && n.subjectType !== typeFilter) return false;
      const authorName = n.authorUserId ? (staffById.get(n.authorUserId) ?? "Unknown") : "Unknown";
      if (authorFilter !== "All authors" && authorName !== authorFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const subj = subjectName.get(`${n.subjectType}:${n.subjectId}`) ?? "";
        if (!n.body.toLowerCase().includes(q) && !subj.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allNotes, typeFilter, authorFilter, query, staffById, subjectName]);

  function exportNotes() {
    const header = "Subject Type,Subject,Note,Author,Date,Pinned\n";
    const body = filtered
      .map((n) => `"${SUBJECT_LABEL[n.subjectType]}","${subjectName.get(`${n.subjectType}:${n.subjectId}`) ?? n.subjectId}","${n.body.replace(/"/g, '""')}","${n.authorUserId ? staffById.get(n.authorUserId) ?? "" : ""}","${n.createdAt}",${n.pinned}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `business-memory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Business Memory</h2>
        <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>Search notes using the field in the header.</span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={exportNotes} style={outlineBtn}>Export</button>
          <button type="button" onClick={() => setAddOpen(true)} style={primaryBtn}><Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />Add Note</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Notes Recorded</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{allNotes.length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Pinned Notes</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "#B54708" }}>{allNotes.filter((n) => n.pinned).length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Contributors</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{new Set(allNotes.map((n) => n.authorUserId).filter(Boolean)).size}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} aria-label="Subject type" style={selectStyle}>
            <option>All subjects</option>
            {(Object.keys(SUBJECT_LABEL) as MemoryNoteSubjectType[]).map((t) => <option key={t} value={t}>{SUBJECT_LABEL[t]}</option>)}
          </select>
          <select value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)} aria-label="Author" style={selectStyle}>
            <option>All authors</option>
            {Array.from(new Set(authorNames)).map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>

        {!isPending && filtered.length === 0 && (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Add what your team should know — allergies, preferences, warnings</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Anything worth remembering about a customer, supplier, product or table.</div>
            <button type="button" onClick={() => setAddOpen(true)} className="mt-[15px]" style={{ ...primaryBtn, padding: "12px 22px", minHeight: 46 }}>Add Note</button>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 960 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Subject</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Note</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Author</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Pinned</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) => {
                  const tone = SUBJECT_TONE[n.subjectType];
                  return (
                    <tr key={n.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[12px_17px]">
                        <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{subjectName.get(`${n.subjectType}:${n.subjectId}`) ?? "—"}</span>
                        <span className="mt-1 inline-block rounded-full px-2 py-[2px] text-[10px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{SUBJECT_LABEL[n.subjectType]}</span>
                      </td>
                      <td className="max-w-[360px] p-[12px] text-[12.5px] leading-relaxed" style={{ color: canSeeNotes ? "var(--app-text-muted)" : "var(--app-text-disabled)" }}>{canSeeNotes ? n.body : "Hidden for your role"}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{n.authorUserId ? staffById.get(n.authorUserId) ?? "—" : "—"}</td>
                      <td className="whitespace-nowrap p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(n.createdAt)}</td>
                      <td className="p-[12px]">
                        {n.pinned && <span className="inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold" style={{ background: "#FEF6E7", color: "#B54708" }}><Pin className="h-3 w-3" aria-hidden />Pinned</span>}
                      </td>
                      <td className="p-[12px_17px] text-end">
                        <span className="inline-flex gap-[7px]">
                          <button type="button" onClick={() => pinMutation.mutate({ id: n.id, pinned: !n.pinned })} disabled={pinMutation.isPending} style={smallOutline}>
                            {n.pinned ? <PinOff className="inline h-3.5 w-3.5" aria-hidden /> : <Pin className="inline h-3.5 w-3.5" aria-hidden />}
                          </button>
                          <button type="button" onClick={() => deleteMutation.mutate(n.id)} disabled={deleteMutation.isPending} style={{ ...smallOutline, color: "#B42318" }}><Trash2 className="inline h-3.5 w-3.5" aria-hidden /></button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && <AddNoteDialog onClose={() => setAddOpen(false)} />}
    </main>
  );
}

function AddNoteDialog({ onClose }: { onClose: () => void }) {
  const [subjectType, setSubjectType] = useState<MemoryNoteSubjectType>("customer");
  const [subjectId, setSubjectId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const queryClient = useQueryClient();

  const { data: customerResults } = useQuery({
    queryKey: ["customer-search", customerQuery],
    queryFn: () => searchCustomers(customerQuery),
    enabled: subjectType === "customer" && customerQuery.trim().length > 1,
  });
  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers, enabled: subjectType === "supplier" });
  const { data: products } = useQuery({ queryKey: ["products", "all"], queryFn: () => fetchProducts(), enabled: subjectType === "product" });
  const { data: tables } = useQuery({ queryKey: ["tables"], queryFn: fetchTables, enabled: subjectType === "table" });

  const options: SubjectOption[] =
    subjectType === "supplier" ? (suppliers ?? []).map((s) => ({ id: s.id, label: s.name }))
    : subjectType === "product" ? (products ?? []).map((p) => ({ id: p.id, label: p.name }))
    : subjectType === "table" ? (tables ?? []).map((t) => ({ id: t.id, label: `Table ${t.number}` }))
    : [];

  const mutation = useMutation({
    mutationFn: () => createMemoryNote({ subjectType, subjectId, body: body.trim(), pinned }),
    onSuccess: () => {
      toast.success("Note saved.");
      queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this note."),
  });

  function selectSubjectType(next: MemoryNoteSubjectType) {
    setSubjectType(next);
    setSubjectId("");
    setCustomerQuery("");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(10,27,42,.42)" }}>
      <div className="w-[460px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Add Note</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>SUBJECT TYPE</label>
            <select value={subjectType} onChange={(e) => selectSubjectType(e.target.value as MemoryNoteSubjectType)} aria-label="Subject type" style={{ width: "100%", ...selectStyle, minHeight: 46 }}>
              {(Object.keys(SUBJECT_LABEL) as MemoryNoteSubjectType[]).map((t) => <option key={t} value={t}>{SUBJECT_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>SUBJECT</label>
            {subjectType === "customer" ? (
              <>
                <input value={customerQuery} onChange={(e) => { setCustomerQuery(e.target.value); setSubjectId(""); }} placeholder="Search customer by name or phone" aria-label="Search customer" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
                {customerResults && customerResults.length > 0 && !subjectId && (
                  <div className="mt-1 flex flex-col overflow-hidden rounded-[11px]" style={{ border: "1px solid var(--app-border)" }}>
                    {customerResults.map((c: CustomerSearchResult) => (
                      <button key={c.id} type="button" onClick={() => { setSubjectId(c.id); setCustomerQuery(c.name); }} className="flex items-center justify-between px-3 py-2 text-start text-[12.5px]" style={{ color: "var(--app-text)" }}>
                        <span>{c.name}</span><span style={{ color: "var(--app-text-disabled)" }}>{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label={SUBJECT_LABEL[subjectType]} style={{ width: "100%", ...selectStyle, minHeight: 46 }}>
                <option value="">Choose one…</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>NOTE</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="What should the team know?" className="w-full rounded-[11px] p-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          </div>
          <label className="flex items-center gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
            <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Pin this note</span>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ accentColor: "var(--app-primary)", width: 18, height: 18 }} />
          </label>
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!subjectId || !body.trim() || mutation.isPending} style={primaryBtn}>{mutation.isPending ? "Saving…" : "Save Note"}</button>
        </div>
      </div>
    </div>
  );
}
