"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Bell, Repeat2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/shared/error-states";
import { Skeleton } from "@/components/shared/skeleton";
import {
  fetchShifts,
  createShift,
  updateShift,
  deleteShift,
  requestShiftSwap,
  approveShiftSwap,
  rejectShiftSwap,
  notifyShifts,
  fetchStaffList,
  type Shift,
} from "@/lib/staff-api";
import { formatTime } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday 00:00 UTC of the week containing `date`. */
function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ScheduleView() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [addingFor, setAddingFor] = useState<{ staffUserId: string; date: string } | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const queryClient = useQueryClient();

  const weekEnd = addDays(weekStart, 7);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: fetchStaffList });
  const {
    data: shifts = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["shifts", isoDate(weekStart)],
    queryFn: () => fetchShifts({ from: weekStart.toISOString(), to: weekEnd.toISOString() }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteShift(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift removed.");
      setSelectedShift(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this shift — please try again."),
  });

  const approveSwapMutation = useMutation({
    mutationFn: (id: string) => approveShiftSwap(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Swap approved — shift reassigned.");
      setSelectedShift(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this swap — please try again."),
  });

  const rejectSwapMutation = useMutation({
    mutationFn: (id: string) => rejectShiftSwap(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Swap rejected.");
      setSelectedShift(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reject this swap — please try again."),
  });

  const staffWithShifts = useMemo(() => {
    const staffIds = new Set(shifts.map((s) => s.staffUserId));
    const withShifts = staffList.filter((s) => staffIds.has(s.id));
    return withShifts.length > 0 ? withShifts : staffList;
  }, [staffList, shifts]);

  const pendingSwapCount = shifts.filter((s) => s.swapStatus === "pending").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium text-fg">
            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(weekStart)} –{" "}
            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(addDays(weekStart, 6))}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {pendingSwapCount > 0 && <Badge tone="warning">{pendingSwapCount} pending swap{pendingSwapCount === 1 ? "" : "s"}</Badge>}
          <Button variant="outline" size="sm" onClick={() => setNotifyOpen(true)} disabled={shifts.length === 0}>
            <Bell className="h-3.5 w-3.5" aria-hidden />
            Notify staff
          </Button>
          <Button size="sm" onClick={() => setAddingFor({ staffUserId: staffList[0]?.id ?? "", date: isoDate(weekStart) })}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add shift
          </Button>
        </div>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load the schedule" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : staffWithShifts.length === 0 ? (
        <div className="rounded-[var(--radius-noxtill)] border border-dashed border-border-strong p-10 text-center text-sm text-fg-muted">
          No staff to schedule. Invite staff from the Team tab first.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="w-36 px-3 py-2.5 text-start">Staff</th>
                {days.map((d, i) => (
                  <th key={i} className="min-w-32 px-2 py-2.5 text-center">
                    {DAY_LABELS[i]} <span className="font-normal normal-case text-fg-faint">{d.getUTCDate()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffWithShifts.map((staff) => (
                <tr key={staff.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 align-top text-sm font-medium text-fg">{staff.name}</td>
                  {days.map((d, i) => {
                    const dayKey = isoDate(d);
                    const dayShifts = shifts.filter((s) => s.staffUserId === staff.id && s.startsAt.slice(0, 10) === dayKey);
                    return (
                      <td key={i} className="min-w-32 px-1.5 py-1.5 align-top">
                        <div className="flex flex-col gap-1">
                          {dayShifts.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => setSelectedShift(s)}
                              className="rounded-[6px] bg-primary/10 px-2 py-1 text-start text-xs text-fg transition-colors hover:bg-primary/16"
                            >
                              <span className="block font-medium">
                                {formatTime(s.startsAt)}–{formatTime(s.endsAt)}
                              </span>
                              {s.swapStatus === "pending" && (
                                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-accent-foreground">
                                  <Repeat2 className="h-2.5 w-2.5" aria-hidden />
                                  Swap pending
                                </span>
                              )}
                            </button>
                          ))}
                          <button
                            onClick={() => setAddingFor({ staffUserId: staff.id, date: dayKey })}
                            className="rounded-[6px] border border-dashed border-border-strong px-2 py-1 text-xs text-fg-faint hover:border-primary hover:text-primary"
                          >
                            <Plus className="mx-auto h-3 w-3" aria-hidden />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addingFor && (
        <ShiftFormDialog
          staffUserId={addingFor.staffUserId}
          date={addingFor.date}
          staffList={staffList}
          onClose={() => setAddingFor(null)}
        />
      )}

      {selectedShift && (
        <ShiftDetailDialog
          shift={selectedShift}
          onDelete={() => deleteMutation.mutate(selectedShift.id)}
          deletePending={deleteMutation.isPending}
          onClose={() => setSelectedShift(null)}
        >
          <div className="flex flex-col gap-3 text-sm">
            {selectedShift.swapStatus === "pending" ? (
              <div className="rounded-[var(--radius-sm)] border border-accent/30 bg-accent/6 p-3.5">
                <p className="mb-1 font-medium text-fg">Swap requested</p>
                {selectedShift.swapReason && <p className="mb-2 text-xs text-fg-muted">&quot;{selectedShift.swapReason}&quot;</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approveSwapMutation.mutate(selectedShift.id)} disabled={approveSwapMutation.isPending}>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectSwapMutation.mutate(selectedShift.id)}
                    disabled={rejectSwapMutation.isPending}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <RequestSwapInline shift={selectedShift} staffList={staffList} onDone={() => setSelectedShift(null)} />
            )}
          </div>
        </ShiftDetailDialog>
      )}

      {notifyOpen && <NotifyStaffDialog shifts={shifts} from={weekStart.toISOString()} to={weekEnd.toISOString()} onClose={() => setNotifyOpen(false)} />}
    </div>
  );
}

function ShiftDetailDialog({
  shift,
  onDelete,
  deletePending,
  onClose,
  children,
}: {
  shift: Shift;
  onDelete: () => void;
  deletePending: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dateKey = shift.startsAt.slice(0, 10);
  const [startTime, setStartTime] = useState(formatTimeInput(shift.startsAt));
  const [endTime, setEndTime] = useState(formatTimeInput(shift.endsAt));
  const [note, setNote] = useState(shift.note ?? "");
  const queryClient = useQueryClient();

  const dirty = startTime !== formatTimeInput(shift.startsAt) || endTime !== formatTimeInput(shift.endsAt) || note !== (shift.note ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      updateShift(shift.id, {
        startsAt: `${dateKey}T${startTime}:00.000Z`,
        endsAt: `${dateKey}T${endTime}:00.000Z`,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this shift — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={shift.staffName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={deletePending}>
            Delete
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!dirty || startTime >= endTime || saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        {children}
      </div>
    </Dialog>
  );
}

function formatTimeInput(iso: string): string {
  return iso.slice(11, 16);
}

function RequestSwapInline({
  shift,
  staffList,
  onDone,
}: {
  shift: Shift;
  staffList: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [coveringUserId, setCoveringUserId] = useState("");
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => requestShiftSwap(shift.id, { coveringUserId: coveringUserId || undefined, reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Swap requested.");
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't request this swap — please try again."),
  });

  return (
    <div className="flex flex-col gap-2.5 border-t border-border pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Request a swap</p>
      <Select value={coveringUserId} onChange={(e) => setCoveringUserId(e.target.value)}>
        <option value="">Covering staff (optional)</option>
        {staffList
          .filter((s) => s.id !== shift.staffUserId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </Select>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />
      <Button size="sm" variant="outline" className="self-start" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? "Requesting…" : "Request swap"}
      </Button>
    </div>
  );
}

function ShiftFormDialog({
  staffUserId: initialStaffUserId,
  date,
  staffList,
  onClose,
}: {
  staffUserId: string;
  date: string;
  staffList: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [staffUserId, setStaffUserId] = useState(initialStaffUserId);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const valid = staffUserId !== "" && startTime < endTime;

  const mutation = useMutation({
    mutationFn: () =>
      createShift({
        staffUserId,
        startsAt: `${date}T${startTime}:00.000Z`,
        endsAt: `${date}T${endTime}:00.000Z`,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this shift — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add shift"
      description={new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T00:00:00.000Z`))}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add shift"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Select label="Staff member" value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)}>
          <option value="">Select…</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}

function NotifyStaffDialog({ shifts, from, to, onClose }: { shifts: Shift[]; from: string; to: string; onClose: () => void }) {
  const affected = useMemo(() => {
    const byId = new Map<string, string>();
    for (const s of shifts) byId.set(s.staffUserId, s.staffName);
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
  }, [shifts]);

  const mutation = useMutation({
    mutationFn: () => notifyShifts(from, to),
    onSuccess: (result) => {
      toast.success(`Notified ${result.notifiedCount} staff member${result.notifiedCount === 1 ? "" : "s"}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send notifications — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Notify staff about this week's schedule"
      description={`This will send a real in-app notification to ${affected.length} staff member${affected.length === 1 ? "" : "s"}:`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={affected.length === 0 || mutation.isPending}>
            {mutation.isPending ? "Sending…" : `Notify ${affected.length}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {affected.map((s) => (
          <Badge key={s.id} tone="primary">
            {s.name}
          </Badge>
        ))}
      </div>
    </Dialog>
  );
}
