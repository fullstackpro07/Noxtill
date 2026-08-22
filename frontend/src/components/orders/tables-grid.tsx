"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, ArrowRightLeft, Combine, Split } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { formatCurrency, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  createTable,
  fetchTables,
  mergeTables,
  moveTable,
  openTable,
  splitBill,
  type LiveTable,
  type LiveTableStatus,
} from "@/lib/tables-api";

const STATUS_TONE: Record<LiveTableStatus, "neutral" | "primary" | "warning" | "danger"> = {
  free: "neutral",
  occupied: "primary",
  reserved: "warning",
  needs_cleaning: "danger",
};
const STATUS_LABEL: Record<LiveTableStatus, string> = {
  free: "Free",
  occupied: "Occupied",
  reserved: "Reserved",
  needs_cleaning: "Needs cleaning",
};

/**
 * Real floor mode (UPD-BE-010): grouped by each table's `floor` field into sections, rather than a
 * free-form drag-and-drop X/Y layout — the schema carries posX/posY for that, but no editor for
 * placing tables on a literal floor plan exists yet; this covers the ticket's "grid" + move/merge/
 * split-bill requirements without inventing a placement UI the spec doesn't otherwise detail.
 */
export function TablesGrid({ currency }: { currency: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const [moving, setMoving] = useState<LiveTable | null>(null);
  const [merging, setMerging] = useState<LiveTable | null>(null);
  const [splitting, setSplitting] = useState<LiveTable | null>(null);
  const queryClient = useQueryClient();

  const { data: tables, isPending, isError, refetch } = useQuery({
    queryKey: ["tables"],
    queryFn: fetchTables,
    refetchInterval: 30_000,
  });

  const openMutation = useMutation({
    mutationFn: (id: string) => openTable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      toast.success("Table opened.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't open this table — please try again."),
  });

  const byFloor = useMemo(() => {
    if (!tables) return [];
    const map = new Map<string, LiveTable[]>();
    for (const table of tables) {
      const key = table.floor ?? "Unassigned";
      const list = map.get(key) ?? [];
      list.push(table);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [tables]);

  if (isError) {
    return <ErrorBanner title="Couldn't load tables" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add table
        </Button>
      </div>

      {tables.length === 0 ? (
        <EmptyState icon={Users} title="No tables yet" description="Add your first table to start using floor mode." />
      ) : (
        byFloor.map(([floor, floorTables]) => (
          <div key={floor} className="flex flex-col gap-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-faint">{floor}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {floorTables.map((table) => (
                <Card key={table.id}>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-display text-lg font-bold text-fg">{table.number}</p>
                      <Badge tone={STATUS_TONE[table.status]}>{STATUS_LABEL[table.status]}</Badge>
                    </div>
                    {table.seats && (
                      <p className="flex items-center gap-1 text-xs text-fg-faint">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {table.seats} seats
                      </p>
                    )}
                    {table.activeOrderId ? (
                      <>
                        <p className="text-sm font-medium text-fg">{formatCurrency(table.runningTotal, currency)} open</p>
                        {table.openedAt && <p className="text-xs text-fg-faint">Since {formatTime(table.openedAt)}</p>}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setMoving(table)}>
                            <ArrowRightLeft className="h-3 w-3" aria-hidden />
                            Move
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setMerging(table)}>
                            <Combine className="h-3 w-3" aria-hidden />
                            Merge
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setSplitting(table)}>
                            <Split className="h-3 w-3" aria-hidden />
                            Split
                          </Button>
                        </div>
                      </>
                    ) : table.status === "free" ? (
                      <Button size="sm" onClick={() => openMutation.mutate(table.id)} disabled={openMutation.isPending}>
                        Open
                      </Button>
                    ) : (
                      <p className="text-xs text-fg-faint">No active order</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <AddTableDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <MoveDialog table={moving} tables={tables} onClose={() => setMoving(null)} />
      <MergeDialog table={merging} tables={tables} onClose={() => setMerging(null)} currency={currency} />
      <SplitBillDialog table={splitting} onClose={() => setSplitting(null)} currency={currency} />
    </div>
  );
}

function AddTableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    <Dialog
      open={open}
      onClose={onClose}
      title="Add table"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!number.trim() || mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add table"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Table number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. T4" />
        <Input label="Floor / section (optional)" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="e.g. Patio" />
        <Input label="Seats (optional)" type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} />
      </div>
    </Dialog>
  );
}

function MoveDialog({ table, tables, onClose }: { table: LiveTable | null; tables?: LiveTable[]; onClose: () => void }) {
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
    <Dialog
      open={table != null}
      onClose={onClose}
      title={table ? `Move table ${table.number}'s order` : "Move"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!destination || mutation.isPending}>
            {mutation.isPending ? "Moving…" : "Move"}
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-fg-muted">No free tables to move to.</p>
      ) : (
        <Select label="Move to" value={destination} onChange={(e) => setDestination(e.target.value)}>
          <option value="" disabled>
            Select a table…
          </option>
          {candidates.map((t) => (
            <option key={t.id} value={t.number}>
              {t.number}
            </option>
          ))}
        </Select>
      )}
    </Dialog>
  );
}

function MergeDialog({
  table,
  tables,
  onClose,
  currency,
}: {
  table: LiveTable | null;
  tables?: LiveTable[];
  onClose: () => void;
  currency: string;
}) {
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
    <Dialog
      open={table != null}
      onClose={onClose}
      title={table ? `Merge table ${table.number} into…` : "Merge"}
      description="Every item from this table's order moves onto the destination's order, and this table is freed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!destination || mutation.isPending}>
            {mutation.isPending ? "Merging…" : "Merge"}
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-fg-muted">No other occupied tables to merge into.</p>
      ) : (
        <Select label="Merge into" value={destination} onChange={(e) => setDestination(e.target.value)}>
          <option value="" disabled>
            Select a table…
          </option>
          {candidates.map((t) => (
            <option key={t.id} value={t.number}>
              {t.number} ({formatCurrency(t.runningTotal, currency)})
            </option>
          ))}
        </Select>
      )}
    </Dialog>
  );
}

function SplitBillDialog({ table, onClose, currency }: { table: LiveTable | null; onClose: () => void; currency: string }) {
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
    <Dialog open={table != null} onClose={handleClose} title={table ? `Split table ${table.number}'s bill` : "Split bill"}>
      <div className="flex flex-col gap-3.5">
        <div className="flex items-end gap-2">
          <Input label="Number of guests" type="number" min={2} value={parts} onChange={(e) => setParts(e.target.value)} className="w-32" />
          <Button onClick={() => previewMutation.mutate()} disabled={Number(parts) < 2 || previewMutation.isPending}>
            {previewMutation.isPending ? "Calculating…" : "Calculate"}
          </Button>
        </div>
        {previewMutation.data && (
          <div className="flex flex-col gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface-2/40 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Total</span>
              <span className="font-medium tabular-nums text-fg">{formatCurrency(previewMutation.data.total, currency)}</span>
            </div>
            {previewMutation.data.shares.map((share, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">Guest {i + 1}</span>
                <span className="tabular-nums text-fg">{formatCurrency(share, currency)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-fg-faint">This is a preview only — it doesn&apos;t change the order or create separate bills.</p>
      </div>
    </Dialog>
  );
}
