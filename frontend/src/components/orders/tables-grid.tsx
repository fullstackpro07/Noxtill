"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { createTable, fetchTables, mergeTables, moveTable, openTable, splitBill, type LiveTable, type LiveTableStatus } from "@/lib/tables-api";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", marginBottom: 5 };
const fieldStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48 };

const STATUS_LABEL: Record<LiveTableStatus, string> = { free: "Free", occupied: "Occupied", reserved: "Reserved", needs_cleaning: "Needs Cleaning" };
const STATUS_COLORS: Record<LiveTableStatus, { bg: string; border: string; fg: string }> = {
  free: { bg: "var(--app-page-bg, #F7FCF9)", border: "var(--app-success-border)", fg: "var(--app-success-text)" },
  occupied: { bg: "#EEF4FF", border: "#C7D7FE", fg: "#1849A9" },
  reserved: { bg: "var(--app-warning-bg)", border: "var(--app-warning-border)", fg: "var(--app-warning-text)" },
  needs_cleaning: { bg: "#FEF3F2", border: "#FDD9D6", fg: "var(--app-danger-strong)" },
};
const LONG_OCCUPIED_MS = 90 * 60_000;

export function TablesGrid() {
  const session = useSession();
  const now = useNow(30_000);
  const queryClient = useQueryClient();
  const [floorFilter, setFloorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<LiveTableStatus | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [moving, setMoving] = useState<LiveTable | null>(null);
  const [merging, setMerging] = useState<LiveTable | null>(null);
  const [splitting, setSplitting] = useState<LiveTable | null>(null);

  const { data: tables } = useQuery({ queryKey: ["tables"], queryFn: fetchTables, refetchInterval: 30_000 });

  const floors = useMemo(() => Array.from(new Set((tables ?? []).map((t) => t.floor ?? "Unassigned"))).sort(), [tables]);
  const filtered = useMemo(
    () => (tables ?? []).filter((t) => (floorFilter === "all" || (t.floor ?? "Unassigned") === floorFilter) && (statusFilter === "all" || t.status === statusFilter)),
    [tables, floorFilter, statusFilter],
  );

  const freeCount = (tables ?? []).filter((t) => t.status === "free").length;
  const occupiedTables = (tables ?? []).filter((t) => t.status === "occupied" && t.seatedAt);
  const needsCleaningCount = (tables ?? []).filter((t) => t.status === "needs_cleaning").length;
  const openValue = occupiedTables.reduce((sum, t) => sum + t.runningTotal, 0);
  const avgSeatedMs = occupiedTables.length > 0 ? occupiedTables.reduce((sum, t) => sum + (now - new Date(t.seatedAt as string).getTime()), 0) / occupiedTables.length : 0;

  const openMutation = useMutation({
    mutationFn: (id: string) => openTable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      toast.success("Table opened.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't open this table — please try again."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Tables</h2>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)} aria-label="Floor" style={selectStyle}>
            <option value="all">All floors</option>
            {floors.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LiveTableStatus | "all")} aria-label="Status" style={selectStyle}>
            <option value="all">All statuses</option>
            {(["free", "occupied", "reserved", "needs_cleaning"] as LiveTableStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button type="button" onClick={() => setAddOpen(true)} style={primaryBtn}>+ Add Table</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-success-border)" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>Free</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{freeCount}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid #C7D7FE" }}>
          <div className="text-[12px] font-bold" style={{ color: "#1849A9" }}>Occupied</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{occupiedTables.length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-warning-border)" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-warning-text)" }}>Needs Cleaning</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{needsCleaningCount}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Open on tables</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(openValue, session.business.currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Avg. time seated</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{occupiedTables.length > 0 ? formatRelativeTime(avgSeatedMs) : "—"}</div>
        </div>
      </div>

      {tables && filtered.length === 0 ? (
        <div className="rounded-[16px] p-[48px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-border-strong)" }}>
          <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>{tables.length === 0 ? "Add your tables to use the floor view" : "No tables match these filters"}</div>
          <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Lay out your floor once and the whole team can read the room at a glance.</div>
          {tables.length === 0 && (
            <button type="button" onClick={() => setAddOpen(true)} className="mt-[15px] rounded-[12px] px-[22px] py-[13px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>+ Add Table</button>
          )}
        </div>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
          {filtered.map((t) => {
            const colors = STATUS_COLORS[t.status];
            const long = t.status === "occupied" && t.seatedAt && now - new Date(t.seatedAt).getTime() > LONG_OCCUPIED_MS;
            return (
              <div key={t.id} className="flex flex-col gap-2.5 rounded-[16px] p-[15px]" style={{ background: colors.bg, border: `1.5px solid ${colors.border}` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>{t.number}</span>
                  <span className="whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-extrabold" style={{ background: "var(--app-surface)", color: colors.fg }}>{STATUS_LABEL[t.status]}</span>
                </div>
                <span className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                  {t.floor ?? "Unassigned"}{t.seats ? ` · ${t.seats} seats` : ""}
                  {t.status === "occupied" && t.seatedAt ? ` · ${formatRelativeTime(now - new Date(t.seatedAt).getTime())}` : ""}
                </span>
                {long && <span className="inline-block self-start rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>Seated 90+ min</span>}

                {t.activeOrderId ? (
                  <div className="border-t pt-[11px]" style={{ borderColor: colors.border }}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>Running total</span>
                      <span className="text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(t.runningTotal, session.business.currency)}</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => setSplitting(t)} className="flex-1 rounded-[9px] p-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)" }}>Split</button>
                      <button type="button" onClick={() => setMoving(t)} className="flex-1 rounded-[9px] p-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)" }}>Move</button>
                      <button type="button" onClick={() => setMerging(t)} className="flex-1 rounded-[9px] p-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)" }}>Merge</button>
                    </div>
                  </div>
                ) : t.status === "free" ? (
                  <div className="border-t pt-[11px]" style={{ borderColor: colors.border }}>
                    <div className="text-[11.5px] font-semibold" style={{ color: "var(--app-success-text)" }}>Ready to seat</div>
                    <button
                      type="button"
                      onClick={() => openMutation.mutate(t.id)}
                      disabled={openMutation.isPending}
                      className="mt-2.5 w-full rounded-[9px] p-2.5 text-[12px] font-extrabold"
                      style={{ border: "1px solid var(--app-success-border)", background: "var(--app-surface)", color: "var(--app-success-text)" }}
                    >
                      Open table
                    </button>
                  </div>
                ) : (
                  <div className="border-t pt-[11px] text-[11.5px]" style={{ borderColor: colors.border, color: "var(--app-text-disabled)" }}>No active order</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddTableModal open={addOpen} onClose={() => setAddOpen(false)} />
      <MoveTableModal table={moving} tables={tables} onClose={() => setMoving(null)} />
      <MergeTableModal table={merging} tables={tables} onClose={() => setMerging(null)} currency={session.business.currency} />
      <SplitBillModal table={splitting} onClose={() => setSplitting(null)} currency={session.business.currency} />
    </main>
  );
}

function AddTableModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [number, setNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [seats, setSeats] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createTable({ number: number.trim(), floor: floor.trim() || undefined, seats: seats ? Number(seats) : undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      toast.success(`Table ${number} added.`);
      setNumber("");
      setFloor("");
      setSeats("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this table — please try again."),
  });

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Add Table"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!number.trim() || mutation.isPending} style={{ ...primaryBtn, opacity: !number.trim() || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Adding…" : "Add Table"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span style={fieldLabel}>TABLE NUMBER</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. T11" style={fieldStyle} />
        </label>
        <label className="block">
          <span style={fieldLabel}>FLOOR</span>
          <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="e.g. Terrace" style={fieldStyle} />
        </label>
        <label className="block">
          <span style={fieldLabel}>SEATS</span>
          <input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} style={{ ...fieldStyle, minHeight: 46 }} />
        </label>
      </div>
    </PosModalShell>
  );
}

function MoveTableModal({ table, tables, onClose }: { table: LiveTable | null; tables?: LiveTable[]; onClose: () => void }) {
  const [destination, setDestination] = useState("");
  const queryClient = useQueryClient();
  const candidates = (tables ?? []).filter((t) => t.id !== table?.id && t.status === "free");

  const mutation = useMutation({
    mutationFn: () => moveTable(table!.id, destination),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      toast.success(`Moved to table ${destination}.`);
      setDestination("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't move this table — please try again."),
  });

  return (
    <PosModalShell
      open={table != null}
      onClose={onClose}
      title="Move Table"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!destination || mutation.isPending} style={{ ...primaryBtn, opacity: !destination || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Moving…" : "Move Table"}
          </button>
        </>
      }
    >
      <div className="p-[17px]">
        {table && (
          <div className="mb-3 flex justify-between">
            <span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Current table</span>
            <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{table.number}</span>
          </div>
        )}
        {candidates.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No free tables to move to.</p>
        ) : (
          <label className="block">
            <span style={fieldLabel}>NEW TABLE</span>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} style={fieldStyle}>
              <option value="" disabled>Select a table…</option>
              {candidates.map((t) => (
                <option key={t.id} value={t.number}>{t.number}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </PosModalShell>
  );
}

function MergeTableModal({ table, tables, onClose, currency }: { table: LiveTable | null; tables?: LiveTable[]; onClose: () => void; currency: string }) {
  const [destination, setDestination] = useState("");
  const queryClient = useQueryClient();
  const candidates = (tables ?? []).filter((t) => t.id !== table?.id && t.activeOrderId);

  const mutation = useMutation({
    mutationFn: () => mergeTables(table!.id, destination),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      toast.success(`Merged into table ${destination}.`);
      setDestination("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't merge these tables — please try again."),
  });

  return (
    <PosModalShell
      open={table != null}
      onClose={onClose}
      title="Merge Tables"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!destination || mutation.isPending} style={{ ...primaryBtn, opacity: !destination || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Merging…" : "Merge Tables"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        {candidates.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No other occupied tables to merge into.</p>
        ) : (
          <label className="block">
            <span style={fieldLabel}>MERGE {table?.number} INTO</span>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} style={fieldStyle}>
              <option value="" disabled>Select a table…</option>
              {candidates.map((t) => (
                <option key={t.id} value={t.number}>{t.number} ({formatCurrency(t.runningTotal, currency)})</option>
              ))}
            </select>
          </label>
        )}
        <div className="rounded-[10px] p-[10px_12px] text-[12px]" style={{ background: "#FEF3F2", color: "var(--app-danger-strong)" }}>Both bills combine into one. This cannot be undone from the floor view.</div>
      </div>
    </PosModalShell>
  );
}

function SplitBillModal({ table, onClose, currency }: { table: LiveTable | null; onClose: () => void; currency: string }) {
  const [parts, setParts] = useState("2");
  const previewMutation = useMutation({
    mutationFn: () => splitBill(table!.activeOrderId!, Number(parts)),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't compute a split for this bill."),
  });

  function handleClose() {
    previewMutation.reset();
    setParts("2");
    onClose();
  }

  return (
    <PosModalShell
      open={table != null}
      onClose={handleClose}
      title="Split Bill"
      footer={
        <>
          <button type="button" onClick={handleClose} style={cancelBtn}>Close</button>
          <button type="button" onClick={() => previewMutation.mutate()} disabled={Number(parts) < 2 || previewMutation.isPending} style={{ ...primaryBtn, opacity: Number(parts) < 2 || previewMutation.isPending ? 0.6 : 1 }}>
            {previewMutation.isPending ? "Calculating…" : "Calculate"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        {table && (
          <div className="flex justify-between">
            <span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Table {table.number} total</span>
            <span className="text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(table.runningTotal, currency)}</span>
          </div>
        )}
        <label className="block">
          <span style={fieldLabel}>NUMBER OF WAYS</span>
          <input type="number" min={2} value={parts} onChange={(e) => setParts(e.target.value)} style={{ ...fieldStyle, fontSize: 16, minHeight: 50 }} />
        </label>
        {previewMutation.data && (
          <div className="rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
            {previewMutation.data.shares.map((share, i) => (
              <div key={i} className="flex justify-between p-[6px_0]" style={{ borderBottom: i < previewMutation.data!.shares.length - 1 ? "1px solid var(--app-surface-2)" : undefined }}>
                <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Guest {i + 1}</span>
                <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(share, currency)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-disabled)" }}>This is a preview only — it doesn&apos;t change the order or create separate bills.</div>
      </div>
    </PosModalShell>
  );
}
