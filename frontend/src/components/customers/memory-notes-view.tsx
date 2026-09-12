"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StickyNote, Pin, PinOff, Trash2, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate, formatTime } from "@/lib/format";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import { fetchSuppliers } from "@/lib/suppliers-api";
import { fetchProducts } from "@/lib/products-api";
import { fetchTables } from "@/lib/tables-api";
import {
  fetchMemoryNotes,
  createMemoryNote,
  updateMemoryNote,
  deleteMemoryNote,
  type MemoryNoteSubjectType,
} from "@/lib/memory-notes-api";

const SUBJECT_LABEL: Record<MemoryNoteSubjectType, string> = {
  customer: "Customer",
  supplier: "Supplier",
  product: "Product",
  table: "Table",
};

interface SubjectOption {
  id: string;
  label: string;
}

export function MemoryNotesView() {
  const [subjectType, setSubjectType] = useState<MemoryNoteSubjectType>("customer");
  const [subjectId, setSubjectId] = useState<string>("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [newBody, setNewBody] = useState("");
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
    subjectType === "supplier"
      ? (suppliers ?? []).map((s) => ({ id: s.id, label: s.name }))
      : subjectType === "product"
        ? (products ?? []).map((p) => ({ id: p.id, label: p.name }))
        : subjectType === "table"
          ? (tables ?? []).map((t) => ({ id: t.id, label: `Table ${t.number}` }))
          : [];

  const { data: notes, isPending: notesPending } = useQuery({
    queryKey: ["memory-notes", subjectType, subjectId],
    queryFn: () => fetchMemoryNotes(subjectType, subjectId),
    enabled: !!subjectId,
  });

  const createMutation = useMutation({
    mutationFn: () => createMemoryNote({ subjectType, subjectId, body: newBody.trim() }),
    onSuccess: () => {
      toast.success("Note saved.");
      queryClient.invalidateQueries({ queryKey: ["memory-notes", subjectType, subjectId] });
      setNewBody("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this note."),
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => updateMemoryNote(id, { pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memory-notes", subjectType, subjectId] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this note."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMemoryNote,
    onSuccess: () => {
      toast.success("Note deleted.");
      queryClient.invalidateQueries({ queryKey: ["memory-notes", subjectType, subjectId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this note."),
  });

  function selectSubjectType(next: MemoryNoteSubjectType) {
    setSubjectType(next);
    setSubjectId("");
    setCustomerQuery("");
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Select label="Subject type" value={subjectType} onChange={(e) => selectSubjectType(e.target.value as MemoryNoteSubjectType)} className="w-40">
            {(Object.keys(SUBJECT_LABEL) as MemoryNoteSubjectType[]).map((t) => (
              <option key={t} value={t}>
                {SUBJECT_LABEL[t]}
              </option>
            ))}
          </Select>

          {subjectType === "customer" ? (
            <div className="min-w-64 flex-1">
              <Input
                label="Search customer by name or phone"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setSubjectId("");
                }}
              />
              {customerResults && customerResults.length > 0 && !subjectId && (
                <div className="mt-1 flex flex-col gap-0.5 rounded-[var(--radius-noxtill)] border border-border">
                  {customerResults.map((c: CustomerSearchResult) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSubjectId(c.id);
                        setCustomerQuery(c.name);
                      }}
                      className="flex items-center justify-between px-3 py-1.5 text-start text-sm hover:bg-surface-2"
                    >
                      <span className="text-fg">{c.name}</span>
                      <span className="text-fg-faint">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Select label={SUBJECT_LABEL[subjectType]} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="min-w-64 flex-1">
              <option value="">Choose one…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </CardContent>
      </Card>

      {!subjectId ? (
        <EmptyState icon={StickyNote} title="Pick a subject to see its notes" description="Every note is tied to a real customer, supplier, product, or table." />
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-2.5 p-4">
              <div>
                <label htmlFor="new-memory-note" className="mb-1.5 block text-sm font-medium text-fg">
                  New note
                </label>
                <textarea
                  id="new-memory-note"
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={3}
                  className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
              <Button size="sm" className="self-end" onClick={() => createMutation.mutate()} disabled={!newBody.trim() || createMutation.isPending}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {createMutation.isPending ? "Saving…" : "Add note"}
              </Button>
            </CardContent>
          </Card>

          {notesPending && (
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <SkeletonRow />
                <SkeletonRow />
              </CardContent>
            </Card>
          )}
          {notes && notes.length === 0 && <EmptyState icon={StickyNote} title="No notes yet" description="Add the first one above." />}
          {notes && notes.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {notes.map((n) => (
                <Card key={n.id}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-sm text-fg">{n.body}</p>
                      <p className="mt-1.5 text-xs text-fg-faint">
                        {formatDate(n.createdAt)} · {formatTime(n.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={n.pinned ? "Unpin" : "Pin"}
                        onClick={() => pinMutation.mutate({ id: n.id, pinned: !n.pinned })}
                        disabled={pinMutation.isPending}
                      >
                        {n.pinned ? <PinOff className="h-3.5 w-3.5 text-primary" aria-hidden /> : <Pin className="h-3.5 w-3.5" aria-hidden />}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => deleteMutation.mutate(n.id)} disabled={deleteMutation.isPending}>
                        <Trash2 className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
