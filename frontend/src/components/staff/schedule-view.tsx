"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  fetchShifts,
  createShift,
  updateShift,
  deleteShift,
  requestShiftSwap,
  approveShiftSwap,
  rejectShiftSwap,
  notifyShifts,
  fetchSchedulePublishStatus,
  fetchStaffList,
  type Shift,
} from "@/lib/staff-api";
import { useSession } from "@/lib/session";
import {
  SimpleKpiTile,
  KpiSkeleton,
  Chip,
  selectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  DisclosureNote,
  CenterModal,
} from "@/components/staff/staff-ui";
import { SideDrawer, DrawerLabel } from "@/components/shared/side-drawer";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COVERAGE_HOURS = [9, 11, 13, 15, 17, 19];
const COVERAGE_LABELS = ["9a", "11a", "1p", "3p", "5p", "7p"];

function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay();
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
  const session = useSession();
  const isManager = session.user.role !== "staff";
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [schStaff, setSchStaff] = useState("All staff");
  const [schRole, setSchRole] = useState("All roles");
  const [addingFor, setAddingFor] = useState<{ staffUserId: string; date: string } | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [swapsOpen, setSwapsOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const queryClient = useQueryClient();

  const weekEnd = addDays(weekStart, 7);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const { data: shifts = [], isPending, isError, refetch } = useQuery({
    queryKey: ["shifts", isoDate(weekStart)],
    queryFn: () => fetchShifts({ from: weekStart.toISOString(), to: weekEnd.toISOString() }),
  });
  const { data: publishStatus } = useQuery({
    queryKey: ["schedule-publish-status", isoDate(weekStart)],
    queryFn: () => fetchSchedulePublishStatus(weekStart.toISOString()),
  });
  const published = publishStatus?.published ?? false;

  function goToWeek(next: Date) {
    setWeekStart(next);
  }

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
    onSuccess: (approved) => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success(approved.swapWithShiftId ? "Swap approved — both shifts traded." : "Swap approved — shift reassigned.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this swap — please try again."),
  });

  const rejectSwapMutation = useMutation({
    mutationFn: (id: string) => rejectShiftSwap(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Swap request rejected.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reject this swap — please try again."),
  });

  const copyWeekMutation = useMutation({
    mutationFn: async () => {
      const prevStart = addDays(weekStart, -7);
      const prevEnd = weekStart;
      const prevShifts = await fetchShifts({ from: prevStart.toISOString(), to: prevEnd.toISOString() });
      await Promise.all(
        prevShifts
          .filter((s) => s.status === "scheduled")
          .map((s) =>
            createShift({
              staffUserId: s.staffUserId,
              startsAt: new Date(new Date(s.startsAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              endsAt: new Date(new Date(s.endsAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              note: s.note ?? undefined,
            }),
          ),
      );
      return prevShifts.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success(count > 0 ? `${count} shift(s) copied from last week into this week as a draft.` : "Last week had no scheduled shifts to copy.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't copy last week's roster — please try again."),
  });

  const notifyMutation = useMutation({
    mutationFn: () => notifyShifts(weekStart.toISOString(), weekEnd.toISOString()),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["schedule-publish-status", isoDate(weekStart)] });
      setPublishOpen(false);
      toast.success(`Schedule published — ${result.notifiedCount} staff notified.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't publish this schedule — please try again."),
  });

  const activeStaff = staffList.filter((s) => s.active);
  const staffWithShiftIds = new Set(shifts.map((s) => s.staffUserId));
  const pendingSwaps = shifts.filter((s) => s.swapStatus === "pending");
  const scheduledShifts = shifts.filter((s) => s.status === "scheduled");
  const totalScheduledHours = scheduledShifts.reduce((a, s) => a + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / (60 * 60 * 1000), 0);

  const staffWithShifts = useMemo(() => {
    let list = activeStaff;
    if (schStaff !== "All staff") list = list.filter((s) => s.name === schStaff);
    if (schRole !== "All roles") list = list.filter((s) => s.role.toLowerCase() === schRole.toLowerCase());
    const staffIds = new Set(shifts.map((s) => s.staffUserId));
    const withShifts = list.filter((s) => staffIds.has(s.id));
    return withShifts.length > 0 ? withShifts : list;
  }, [activeStaff, shifts, schStaff, schRole]);

  const coverage = days.map((d) => {
    const dayKey = isoDate(d);
    return COVERAGE_HOURS.map((h) => {
      const n = shifts.filter((s) => s.status === "scheduled" && s.startsAt.slice(0, 10) === dayKey && new Date(s.startsAt).getUTCHours() <= h && new Date(s.endsAt).getUTCHours() > h).length;
      const bg = n === 0 ? "#FEF3F2" : n === 1 ? "#FEF6E7" : n === 2 ? "#BFE7CF" : "#12A150";
      const fg = n >= 3 ? "#fff" : "#0A1B2A";
      return { n, bg, fg };
    });
  });

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load the schedule</p>
        <button type="button" onClick={() => refetch()} className="mt-3.5 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={primaryBtnStyle()}>Retry</button>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <button type="button" onClick={() => goToWeek(addDays(weekStart, -7))} aria-label="Previous week" className="flex items-center justify-center rounded-[10px]" style={{ ...outlineBtnStyle, width: 40, padding: 0 }}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-40 text-center text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>
          {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(weekStart)} – {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(addDays(weekStart, 6))}
        </span>
        <button type="button" onClick={() => goToWeek(addDays(weekStart, 7))} aria-label="Next week" className="flex items-center justify-center rounded-[10px]" style={{ ...outlineBtnStyle, width: 40, padding: 0 }}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <Chip label={published ? "Approved" : "Pending"} />

        <select value={schStaff} onChange={(e) => setSchStaff(e.target.value)} aria-label="Staff" className="rounded-[11px]" style={selectStyle}>
          <option>All staff</option>
          {activeStaff.map((s) => <option key={s.id}>{s.name}</option>)}
        </select>
        <select value={schRole} onChange={(e) => setSchRole(e.target.value)} aria-label="Role" className="rounded-[11px]" style={selectStyle}>
          <option>All roles</option>
          <option>Owner</option>
          <option>Manager</option>
          <option>Staff</option>
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-[9px]">
          {!isManager && (
            <button
              type="button"
              onClick={() => {
                const mine = shifts.find((s) => s.staffUserId === session.user.businessUserId);
                if (!mine) { toast.info("You have no shift scheduled this week to request a swap for."); return; }
                setSelectedShift(mine);
              }}
              className="rounded-[11px]"
              style={outlineBtnStyle}
            >
              Request swap
            </button>
          )}
          {isManager && (
            <button type="button" onClick={() => setSwapsOpen(true)} className="rounded-[11px]" style={outlineBtnStyle}>
              Approve Swaps{pendingSwaps.length > 0 ? ` (${pendingSwaps.length})` : ""}
            </button>
          )}
          {isManager && (
            <button type="button" onClick={() => copyWeekMutation.mutate()} disabled={copyWeekMutation.isPending} className="rounded-[11px]" style={outlineBtnStyle}>
              {copyWeekMutation.isPending ? "Copying…" : "Copy Last Week"}
            </button>
          )}
          {isManager && (
            <button type="button" onClick={() => setPublishOpen(true)} disabled={scheduledShifts.length === 0} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>
              Publish Schedule
            </button>
          )}
          {isManager && (
            <button type="button" onClick={() => setAddingFor({ staffUserId: activeStaff[0]?.id ?? "", date: isoDate(weekStart) })} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>
              Add Shift
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <SimpleKpiTile label="Shifts This Week" value={String(scheduledShifts.length)} valueSize={22} />
            <SimpleKpiTile label="Staff Without a Shift" labelColor="#B42318" value={String(activeStaff.length - staffWithShiftIds.size)} valueSize={22} border="1.5px solid #FDD9D6" />
            <SimpleKpiTile label="Swap Requests Pending" labelColor="#B54708" value={String(pendingSwaps.length)} valueSize={22} border="1.5px solid #FDE3B3" />
            <SimpleKpiTile label="Total Scheduled Hours" value={`${totalScheduledHours.toFixed(0)} h`} valueSize={22} />
          </>
        )}
      </div>

      <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
        <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Coverage heatmap</h3>
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }} />
                {COVERAGE_LABELS.map((h) => <th key={h} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--app-text-disabled)", padding: 4 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {days.map((d, di) => (
                <tr key={di}>
                  <td style={{ fontSize: 11, fontWeight: 700, color: "var(--app-text-faint)", padding: 4 }}>{DAY_LABELS[di]}</td>
                  {coverage[di].map((c, hi) => (
                    <td key={hi} style={{ padding: 3 }}>
                      <div className="flex items-center justify-center rounded-[6px] text-[10.5px] font-extrabold" style={{ width: 46, height: 30, background: c.bg, color: c.fg }}>{c.n}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2.5 flex items-center gap-3.5 text-[11px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "#FEF3F2" }} />0</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "#FEF6E7" }} />1</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "#BFE7CF" }} />2</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "#12A150" }} />3+</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {staffWithShifts.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No staff to schedule</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px", width: 150 }}>Staff</th>
                  {days.map((d, i) => (
                    <th key={i} style={{ fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10, minWidth: 110 }}>
                      {DAY_LABELS[i]} <span style={{ fontWeight: 500, color: "var(--app-text-disabled)" }}>{d.getUTCDate()}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffWithShifts.map((staff) => (
                  <tr key={staff.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "10px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{staff.name}</td>
                    {days.map((d, i) => {
                      const dayKey = isoDate(d);
                      const dayShifts = shifts.filter((s) => s.staffUserId === staff.id && s.startsAt.slice(0, 10) === dayKey);
                      return (
                        <td key={i} style={{ padding: 5, verticalAlign: "top" }}>
                          <div className="flex flex-col gap-1">
                            {dayShifts.map((s) => {
                              const c = s.swapStatus === "pending" ? { bg: "#FEF6E7", fg: "#B54708" } : s.status === "cancelled" ? { bg: "#F2F4F7", fg: "#475467" } : { bg: "#E8F7EE", fg: "#0E8442" };
                              return (
                                <button key={s.id} type="button" onClick={() => setSelectedShift(s)} className="rounded-[7px] text-left" style={{ background: c.bg, padding: "5px 7px" }}>
                                  <span className="block text-[11px] font-extrabold" style={{ color: c.fg }}>
                                    {new Date(s.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–{new Date(s.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                  </span>
                                  {s.swapStatus === "pending" && <span className="text-[9.5px] font-bold" style={{ color: "#B54708" }}>Swap pending</span>}
                                </button>
                              );
                            })}
                            {isManager && (
                              <button type="button" onClick={() => setAddingFor({ staffUserId: staff.id, date: dayKey })} className="rounded-[7px] text-center text-[13px]" style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-text-disabled)", padding: "3px 0" }}>+</button>
                            )}
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
      </div>

      <DisclosureNote>Click any cell to add or edit a shift — no dragging required.</DisclosureNote>

      {addingFor && <ShiftDrawer staffUserId={addingFor.staffUserId} date={addingFor.date} staffList={activeStaff} onClose={() => setAddingFor(null)} />}
      {selectedShift && (
        <ShiftDetailDrawer
          shift={selectedShift}
          staffList={activeStaff}
          shifts={shifts}
          isManager={isManager}
          onClose={() => setSelectedShift(null)}
          onDelete={() => deleteMutation.mutate(selectedShift.id)}
          deletePending={deleteMutation.isPending}
          onApprove={() => approveSwapMutation.mutate(selectedShift.id)}
          onReject={() => rejectSwapMutation.mutate(selectedShift.id)}
        />
      )}
      {swapsOpen && (
        <CenterModal title="Swap Requests" onClose={() => setSwapsOpen(false)} footer={<button type="button" onClick={() => setSwapsOpen(false)} className="w-full rounded-[11px] py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>}>
          {pendingSwaps.length === 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No pending swap requests this week.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {pendingSwaps.map((s) => {
                const targetName = staffList.find((st) => st.id === s.swapCoveringUserId)?.name ?? "anyone available";
                return (
                  <div key={s.id} className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
                    <p className="m-0 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{s.staffName}</p>
                    <p className="m-0 mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
                      Wants to swap <b>{new Date(s.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</b> with {targetName}
                    </p>
                    {s.swapReason && <p className="m-0 mt-1 text-[11.5px] italic" style={{ color: "var(--app-text-disabled)" }}>&quot;{s.swapReason}&quot;</p>}
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => rejectSwapMutation.mutate(s.id)} className="rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Reject</button>
                      <button type="button" onClick={() => approveSwapMutation.mutate(s.id)} className="rounded-[9px] px-3 py-1.5 text-[11.5px] font-extrabold text-white" style={primaryBtnStyle()}>Approve</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CenterModal>
      )}
      {publishOpen && (
        <CenterModal
          title="Publish Schedule"
          onClose={() => setPublishOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setPublishOpen(false)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
              <button type="button" onClick={() => notifyMutation.mutate()} disabled={notifyMutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>
                {notifyMutation.isPending ? "Publishing…" : "Publish Schedule"}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Staff to notify</div>
              <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{staffWithShiftIds.size}</div>
            </div>
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Shifts this week</div>
              <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{scheduledShifts.length}</div>
            </div>
          </div>
          <DisclosureNote>Each person gets a real notification listing this week&apos;s shifts. Unfilled slots aren&apos;t announced.</DisclosureNote>
        </CenterModal>
      )}
    </main>
  );
}

function ShiftDrawer({ staffUserId: initialStaffUserId, date, staffList, onClose }: { staffUserId: string; date: string; staffList: { id: string; name: string }[]; onClose: () => void }) {
  const [staffUserId, setStaffUserId] = useState(initialStaffUserId);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const valid = staffUserId !== "" && startTime < endTime;

  const mutation = useMutation({
    mutationFn: () => createShift({ staffUserId, startsAt: `${date}T${startTime}:00.000Z`, endsAt: `${date}T${endTime}:00.000Z`, note: note.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift saved. Publish the week to notify staff.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this shift — please try again."),
  });

  return (
    <SideDrawer
      title="Add Shift"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()} className="flex-1 rounded-[11px] py-3 text-[13px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>
            {mutation.isPending ? "Saving…" : "Save Shift"}
          </button>
        </>
      }
    >
      <div>
        <DrawerLabel>Staff</DrawerLabel>
        <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} style={selectStyle} className="w-full">
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <p className="m-0 text-[12px]" style={{ color: "var(--app-text-faint)" }}>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T00:00:00.000Z`))}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Start time</DrawerLabel>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
        <div>
          <DrawerLabel>End time</DrawerLabel>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
      </div>
      <div>
        <DrawerLabel>Notes</DrawerLabel>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
      <DisclosureNote>Saving keeps the week as a draft. Staff are only notified when you publish.</DisclosureNote>
    </SideDrawer>
  );
}

function ShiftDetailDrawer({
  shift,
  staffList,
  shifts,
  isManager,
  onClose,
  onDelete,
  deletePending,
  onApprove,
  onReject,
}: {
  shift: Shift;
  staffList: { id: string; name: string }[];
  shifts: Shift[];
  isManager: boolean;
  onClose: () => void;
  onDelete: () => void;
  deletePending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const dateKey = shift.startsAt.slice(0, 10);
  const [startTime, setStartTime] = useState(shift.startsAt.slice(11, 16));
  const [endTime, setEndTime] = useState(shift.endsAt.slice(11, 16));
  const [note, setNote] = useState(shift.note ?? "");
  const queryClient = useQueryClient();

  const dirty = startTime !== shift.startsAt.slice(11, 16) || endTime !== shift.endsAt.slice(11, 16) || note !== (shift.note ?? "");

  const saveMutation = useMutation({
    mutationFn: () => updateShift(shift.id, { startsAt: `${dateKey}T${startTime}:00.000Z`, endsAt: `${dateKey}T${endTime}:00.000Z`, note: note.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift updated.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this shift — please try again."),
  });

  return (
    <SideDrawer
      title={shift.staffName}
      onClose={onClose}
      footer={
        isManager ? (
          <>
            <button type="button" onClick={onDelete} disabled={deletePending} className="rounded-[11px] px-4 py-3 text-[12.5px] font-bold" style={{ border: "1px solid #FDD9D6", color: "#B42318" }}>{deletePending ? "Removing…" : "Delete"}</button>
            <button type="button" onClick={() => saveMutation.mutate()} disabled={!dirty || startTime >= endTime || saveMutation.isPending} className="flex-1 rounded-[11px] py-3 text-[13px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose} className="w-full rounded-[11px] py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>
        )
      }
    >
      {isManager ? (
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <DrawerLabel>Start time</DrawerLabel>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          </div>
          <div>
            <DrawerLabel>End time</DrawerLabel>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
            <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>Start</div>
            <div className="mt-1 text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{new Date(shift.startsAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}</div>
          </div>
          <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
            <div className="text-[11px] font-bold" style={{ color: "var(--app-text-faint)" }}>End</div>
            <div className="mt-1 text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{new Date(shift.endsAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}</div>
          </div>
        </div>
      )}
      {isManager ? (
        <div>
          <DrawerLabel>Notes</DrawerLabel>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
      ) : (
        shift.note && <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{shift.note}</p>
      )}

      {shift.swapStatus === "pending" ? (
        <div className="rounded-[11px] p-3.5" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3" }}>
          <p className="m-0 mb-1 text-[12.5px] font-bold" style={{ color: "#93370D" }}>Swap requested</p>
          {shift.swapReason && <p className="m-0 mb-2 text-[11.5px]" style={{ color: "#93370D" }}>&quot;{shift.swapReason}&quot;</p>}
          {shift.swapWithShiftId ? (
            (() => {
              const paired = shifts.find((s) => s.id === shift.swapWithShiftId);
              return (
                <p className="m-0 mb-2 text-[11.5px]" style={{ color: "#93370D" }}>
                  {paired ? `Real trade: they'll take this shift, you'll get their ${new Date(paired.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${new Date(paired.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} shift.` : "Real trade — the proposed shift back is no longer visible in this week."}
                </p>
              );
            })()
          ) : (
            <p className="m-0 mb-2 text-[11.5px]" style={{ color: "#93370D" }}>One-way coverage request — nothing traded back.</p>
          )}
          {isManager && (
            <div className="flex gap-2">
              <button type="button" onClick={onApprove} className="rounded-[9px] px-3 py-1.5 text-[11.5px] font-extrabold text-white" style={primaryBtnStyle()}>Approve</button>
              <button type="button" onClick={onReject} className="rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Reject</button>
            </div>
          )}
        </div>
      ) : (
        <RequestSwapInline shift={shift} staffList={staffList} shifts={shifts} onDone={onClose} />
      )}
    </SideDrawer>
  );
}

function RequestSwapInline({ shift, staffList, shifts, onDone }: { shift: Shift; staffList: { id: string; name: string }[]; shifts: Shift[]; onDone: () => void }): ReactNode {
  const [coveringUserId, setCoveringUserId] = useState("");
  const [swapWithShiftId, setSwapWithShiftId] = useState("");
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const coveringPersonShifts = shifts.filter((s) => s.staffUserId === coveringUserId && s.id !== shift.id);
  if (coveringUserId === "" && swapWithShiftId !== "") setSwapWithShiftId("");

  const mutation = useMutation({
    mutationFn: () => requestShiftSwap(shift.id, { coveringUserId: coveringUserId || undefined, reason: reason || undefined, swapWithShiftId: swapWithShiftId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success(swapWithShiftId ? "Swap requested — proposed as a real trade." : "Swap requested.");
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't request this swap — please try again."),
  });

  return (
    <div className="flex flex-col gap-2.5 pt-1" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
      <DrawerLabel>Request a swap</DrawerLabel>
      <select value={coveringUserId} onChange={(e) => setCoveringUserId(e.target.value)} style={selectStyle} className="w-full">
        <option value="">Covering staff (optional)</option>
        {staffList.filter((s) => s.id !== shift.staffUserId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {coveringUserId && (
        <select value={swapWithShiftId} onChange={(e) => setSwapWithShiftId(e.target.value)} style={selectStyle} className="w-full">
          <option value="">One-way — just give them this shift</option>
          {coveringPersonShifts.map((s) => (
            <option key={s.id} value={s.id}>Trade for their {new Date(s.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} shift</option>
          ))}
        </select>
      )}
      {coveringUserId && coveringPersonShifts.length === 0 && <p className="m-0 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>They have no shifts this week to trade back — this will be a one-way coverage request.</p>}
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="self-start rounded-[10px] px-4 py-2 text-[12px] font-bold" style={outlineBtnStyle}>
        {mutation.isPending ? "Requesting…" : "Request swap"}
      </button>
    </div>
  );
}
