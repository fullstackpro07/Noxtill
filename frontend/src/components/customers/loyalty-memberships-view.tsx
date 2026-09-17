"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stamp, Plus, Gift, RefreshCw, X, Check, UserPlus } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import {
  fetchLoyaltyPrograms,
  createLoyaltyProgram,
  fetchLoyaltyMembers,
  enrollLoyaltyMember,
  redeemLoyaltyMember,
} from "@/lib/loyalty-api";
import {
  fetchMembershipPlans,
  createMembershipPlan,
  fetchMemberships,
  createMembership,
  activateMembership,
  renewCashMembership,
  cancelMembership,
  type MembershipPlan,
} from "@/lib/memberships-api";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

export function LoyaltyMembershipsView() {
  const [tab, setTab] = useState<"loyalty" | "memberships">("loyalty");

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex gap-[3px] self-start rounded-[10px] p-[3px]" style={{ background: "var(--app-surface-2)" }}>
        {(["loyalty", "memberships"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className="rounded-[8px] px-[15px] py-[9px] text-[12px] font-bold"
            style={{ background: tab === k ? "var(--app-surface)" : "transparent", color: tab === k ? "var(--app-text)" : "var(--app-text-muted)", minHeight: 40 }}
          >
            {k === "loyalty" ? "Loyalty" : "Memberships"}
          </button>
        ))}
      </div>
      {tab === "loyalty" ? <LoyaltyTab /> : <MembershipsTab />}
    </main>
  );
}

function LoyaltyTab() {
  const [programId, setProgramId] = useState<string>("");
  const [newProgramOpen, setNewProgramOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: programs, isPending } = useQuery({ queryKey: ["loyalty-programs"], queryFn: fetchLoyaltyPrograms });
  const activeProgramId = programId || programs?.[0]?.id || "";
  const program = programs?.find((p) => p.id === activeProgramId);

  const { data: members, isPending: membersPending } = useQuery({
    queryKey: ["loyalty-members", activeProgramId],
    queryFn: () => fetchLoyaltyMembers(activeProgramId),
    enabled: !!activeProgramId,
  });

  const redeemMutation = useMutation({
    mutationFn: redeemLoyaltyMember,
    onSuccess: () => {
      toast.success("Redeemed — card reset for the next round.");
      queryClient.invalidateQueries({ queryKey: ["loyalty-members", activeProgramId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't redeem — please try again."),
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-1 rounded-[16px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (!programs || programs.length === 0) {
    return (
      <>
        <div className="rounded-[16px] p-[48px_24px] text-center" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-border-strong)" }}>
          <Stamp className="mx-auto mb-3 h-9 w-9" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
          <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No loyalty program yet</div>
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Set up a punch-card or tier program to start rewarding repeat customers.</p>
          <button type="button" onClick={() => setNewProgramOpen(true)} className="mt-4" style={primaryBtn}>Create program</button>
        </div>
        <NewProgramDialog open={newProgramOpen} onClose={() => setNewProgramOpen(false)} />
      </>
    );
  }

  const stampsIssued = (members ?? []).reduce((s, m) => s + m.stampCount + m.redeemedCount * (program?.stampsRequired ?? 0), 0);
  const rewardsClaimed = (members ?? []).reduce((s, m) => s + m.redeemedCount, 0);

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={activeProgramId} onChange={(e) => setProgramId(e.target.value)} aria-label="Loyalty program" style={{ border: "1px solid var(--app-border)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 44 }}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.type === "punch_card" ? `${p.stampsRequired} stamps` : "tiers"})</option>
          ))}
        </select>
        <div className="flex gap-[9px]">
          <button type="button" onClick={() => setEnrollOpen(true)} style={outlineBtn}><UserPlus className="mr-1 inline h-3.5 w-3.5" aria-hidden />Enroll Customer</button>
          <button type="button" onClick={() => setNewProgramOpen(true)} style={primaryBtn}><Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />New Program</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Active Members</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{members?.length ?? 0}</div>
        </div>
        {program?.type === "punch_card" && (
          <>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Stamps Issued</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{stampsIssued}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Rewards Claimed</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{rewardsClaimed}</div>
            </div>
          </>
        )}
        {program?.rewardDescription && (
          <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Reward</div>
            <div className="mt-1.5 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{program.rewardDescription}</div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {membersPending && (
          <div className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}
        {members && members.length === 0 && (
          <div className="p-[48px_18px] text-center">
            <Gift className="mx-auto mb-2 h-7 w-7" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            <div className="text-[14px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No members yet</div>
            <div className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Enroll a customer to start issuing real stamps on their purchases.</div>
          </div>
        )}
        {members && members.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 640 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Progress</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Redeemed</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const eligible = program?.type === "punch_card" && m.stampCount >= (program?.stampsRequired ?? Infinity);
                  return (
                    <tr key={m.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[11px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{m.customer.name}</td>
                      <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                        {program?.type === "punch_card" ? `${m.stampCount} / ${program.stampsRequired} stamps` : (
                          <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: m.currentTier ? "#EEF4FF" : "var(--app-surface-2)", color: m.currentTier ? "#3538CD" : "var(--app-text-muted)" }}>{m.currentTier ?? "No tier yet"}</span>
                        )}
                      </td>
                      <td className="p-[11px] text-end text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{m.redeemedCount}</td>
                      <td className="p-[11px_17px] text-end">
                        {program?.type === "punch_card" && (
                          <button type="button" onClick={() => redeemMutation.mutate(m.id)} disabled={!eligible || redeemMutation.isPending} className="rounded-[9px] px-[13px] py-2 text-[11.5px] font-bold" style={eligible ? { border: 0, background: "var(--app-primary)", color: "#fff" } : { border: "1px solid var(--app-border)", color: "var(--app-text-disabled)" }}>Redeem</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewProgramDialog open={newProgramOpen} onClose={() => setNewProgramOpen(false)} />
      <EnrollLoyaltyDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} programId={activeProgramId} />
    </div>
  );
}

function NewProgramDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"punch_card" | "tier">("punch_card");
  const [stampsRequired, setStampsRequired] = useState("10");
  const [rewardDescription, setRewardDescription] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createLoyaltyProgram({
        name,
        type,
        stampsRequired: type === "punch_card" ? Number(stampsRequired) || 10 : undefined,
        rewardDescription: rewardDescription.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Loyalty program created.");
      queryClient.invalidateQueries({ queryKey: ["loyalty-programs"] });
      setName("");
      setRewardDescription("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this program."),
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="New loyalty program"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Program name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="punch_card">Punch card</option>
          <option value="tier">Tier</option>
        </Select>
        {type === "punch_card" && <Input label="Stamps required" type="number" min={1} value={stampsRequired} onChange={(e) => setStampsRequired(e.target.value)} />}
        <Input label="Reward description (optional)" value={rewardDescription} onChange={(e) => setRewardDescription(e.target.value)} />
      </div>
    </Dialog>
  );
}

function EnrollLoyaltyDialog({ open, onClose, programId }: { open: boolean; onClose: () => void; programId: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const queryClient = useQueryClient();

  const { data: results } = useQuery({ queryKey: ["customer-search", query], queryFn: () => searchCustomers(query), enabled: query.trim().length > 1 });

  const mutation = useMutation({
    mutationFn: () => enrollLoyaltyMember(programId, selected!.id),
    onSuccess: () => {
      toast.success(`${selected!.name} enrolled.`);
      queryClient.invalidateQueries({ queryKey: ["loyalty-members", programId] });
      setQuery("");
      setSelected(null);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't enroll this customer."),
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Enroll a customer"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!selected || mutation.isPending}>
            {mutation.isPending ? "Enrolling…" : "Enroll"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Search by name or phone"
          autoFocus
          value={selected ? selected.name : query}
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
          }}
        />
        {!selected && results && results.length > 0 && (
          <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border">
            {results.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)} className="flex items-center justify-between px-3 py-2 text-start text-sm hover:bg-surface-2">
                <span className="text-fg">{r.name}</span>
                <span className="text-fg-faint">{r.phone}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function MembershipsTab() {
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const session = useSession();
  const queryClient = useQueryClient();

  const { data: plans, isPending: plansPending } = useQuery({ queryKey: ["membership-plans"], queryFn: fetchMembershipPlans });
  const { data: memberships, isPending } = useQuery({ queryKey: ["memberships"], queryFn: () => fetchMemberships() });

  const planById = new Map((plans ?? []).map((p) => [p.id, p]));

  const activateMutation = useMutation({
    mutationFn: activateMembership,
    onSuccess: () => {
      toast.success("Membership activated.");
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't activate this membership."),
  });
  const renewMutation = useMutation({
    mutationFn: renewCashMembership,
    onSuccess: (m) => {
      toast.success(`Renewed — next due ${m.currentPeriodEnd ? formatDate(m.currentPeriodEnd) : "—"}.`);
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't renew this membership."),
  });
  const cancelMutation = useMutation({
    mutationFn: cancelMembership,
    onSuccess: () => {
      toast.success("Membership cancelled.");
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this membership — the real Stripe cancellation may have failed."),
  });

  if (isPending || plansPending) {
    return (
      <div className="flex flex-col gap-1 rounded-[16px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <>
        <div className="rounded-[16px] p-[48px_24px] text-center" style={{ background: "var(--app-surface)", border: "1px dashed var(--app-border-strong)" }}>
          <Gift className="mx-auto mb-3 h-9 w-9" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
          <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No membership plan yet</div>
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Create a recurring plan customers can enroll in with cash or a real Stripe subscription.</p>
          <button type="button" onClick={() => setNewPlanOpen(true)} className="mt-4" style={primaryBtn}>Create plan</button>
        </div>
        <NewPlanDialog open={newPlanOpen} onClose={() => setNewPlanOpen(false)} />
      </>
    );
  }

  const mrr = (memberships ?? [])
    .filter((m) => m.status === "active")
    .reduce((s, m) => s + (m.plan.interval === "monthly" ? Number(m.plan.price) : Number(m.plan.price) / 12), 0);

  const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
    active: { bg: "#E8F7EE", fg: "#0E8442" },
    pending: { bg: "#FEF6E7", fg: "#B54708" },
    expired: { bg: "#FEF3F2", fg: "#B42318" },
    cancelled: { bg: "var(--app-surface-2)", fg: "var(--app-text-muted)" },
  };

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="flex justify-end gap-[9px]">
        <button type="button" onClick={() => setEnrollOpen(true)} style={outlineBtn}><UserPlus className="mr-1 inline h-3.5 w-3.5" aria-hidden />Enroll Customer</button>
        <button type="button" onClick={() => setNewPlanOpen(true)} style={primaryBtn}><Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />New Plan</button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Active Memberships</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{(memberships ?? []).filter((m) => m.status === "active").length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Membership MRR</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(mrr, session.business.currency)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {(!memberships || memberships.length === 0) && (
          <div className="p-[48px_18px] text-center">
            <Gift className="mx-auto mb-2 h-7 w-7" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            <div className="text-[14px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No memberships yet</div>
            <div className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Enroll a customer above.</div>
          </div>
        )}
        {memberships && memberships.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 780 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Plan</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Method</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Due</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[11px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{m.customer.name}</td>
                    <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{planById.get(m.planId)?.name ?? m.plan.name}</td>
                    <td className="p-[11px] text-[12.5px] capitalize" style={{ color: "var(--app-text-muted)" }}>{m.method}</td>
                    <td className="p-[11px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold capitalize" style={{ background: STATUS_TONE[m.status].bg, color: STATUS_TONE[m.status].fg }}>{m.status}</span></td>
                    <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{m.currentPeriodEnd ? formatDate(m.currentPeriodEnd) : "—"}</td>
                    <td className="p-[11px_17px] text-end">
                      <span className="inline-flex justify-end gap-[7px]">
                        {m.status === "pending" && m.method === "online" && (
                          <button type="button" onClick={() => activateMutation.mutate(m.id)} disabled={activateMutation.isPending} className="rounded-[9px] px-[11px] py-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}><Check className="mr-1 inline h-3 w-3" aria-hidden />Activate</button>
                        )}
                        {m.method === "cash" && (m.status === "active" || m.status === "expired") && (
                          <button type="button" onClick={() => renewMutation.mutate(m.id)} disabled={renewMutation.isPending} className="rounded-[9px] px-[11px] py-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}><RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />Renew</button>
                        )}
                        {(m.status === "active" || m.status === "pending") && (
                          <button type="button" onClick={() => cancelMutation.mutate(m.id)} disabled={cancelMutation.isPending} className="rounded-[9px] px-[11px] py-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "#B42318" }}><X className="mr-1 inline h-3 w-3" aria-hidden />Cancel</button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewPlanDialog open={newPlanOpen} onClose={() => setNewPlanOpen(false)} />
      <EnrollMembershipDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} plans={plans} currency={session.business.currency} />
    </div>
  );
}

function NewPlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [benefits, setBenefits] = useState("");
  const [stripePriceId, setStripePriceId] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createMembershipPlan({
        name,
        price: Number(price),
        interval,
        benefits: benefits.trim() || undefined,
        stripePriceId: stripePriceId.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Membership plan created.");
      queryClient.invalidateQueries({ queryKey: ["membership-plans"] });
      setName("");
      setPrice("");
      setBenefits("");
      setStripePriceId("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this plan."),
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="New membership plan"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || !price || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Plan name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Price" type="number" min={0.01} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          <Select label="Interval" value={interval} onChange={(e) => setInterval(e.target.value as typeof interval)}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </div>
        <Input label="Benefits (optional)" value={benefits} onChange={(e) => setBenefits(e.target.value)} />
        <Input label="Stripe price ID (optional — enables online enrollment)" value={stripePriceId} onChange={(e) => setStripePriceId(e.target.value)} />
      </div>
    </Dialog>
  );
}

function EnrollMembershipDialog({ open, onClose, plans, currency }: { open: boolean; onClose: () => void; plans: MembershipPlan[]; currency: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [method, setMethod] = useState<"cash" | "online">("cash");
  const queryClient = useQueryClient();

  const { data: results } = useQuery({ queryKey: ["customer-search", query], queryFn: () => searchCustomers(query), enabled: query.trim().length > 1 });
  const plan = plans.find((p) => p.id === (planId || plans[0]?.id));

  const mutation = useMutation({
    mutationFn: () =>
      createMembership({
        customerId: selected!.id,
        planId: planId || plans[0].id,
        method,
        successUrl: method === "online" ? `${window.location.origin}/customers/loyalty` : undefined,
        cancelUrl: method === "online" ? `${window.location.origin}/customers/loyalty` : undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      if (result.checkoutUrl) {
        toast.success("Redirecting to Stripe checkout…");
        window.location.href = result.checkoutUrl;
        return;
      }
      toast.success(`${selected!.name} enrolled.`);
      setQuery("");
      setSelected(null);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't enroll this customer."),
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Enroll a customer"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!selected || !planId || mutation.isPending}>
            {mutation.isPending ? "Enrolling…" : method === "online" ? "Continue to checkout" : "Enroll"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Search by name or phone"
          autoFocus
          value={selected ? selected.name : query}
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
          }}
        />
        {!selected && results && results.length > 0 && (
          <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border">
            {results.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)} className="flex items-center justify-between px-3 py-2 text-start text-sm hover:bg-surface-2">
                <span className="text-fg">{r.name}</span>
                <span className="text-fg-faint">{r.phone}</span>
              </button>
            ))}
          </div>
        )}
        <Select label="Plan" value={planId || plans[0]?.id} onChange={(e) => setPlanId(e.target.value)}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatCurrency(Number(p.price), currency)}/{p.interval === "monthly" ? "mo" : "yr"}
            </option>
          ))}
        </Select>
        <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="cash">Cash (active immediately)</option>
          <option value="online" disabled={!plan?.stripePriceId}>
            Online — real Stripe subscription{!plan?.stripePriceId ? " (no Stripe price configured for this plan)" : ""}
          </option>
        </Select>
      </div>
    </Dialog>
  );
}
