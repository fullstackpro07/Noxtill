"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stamp, Plus, Gift, RefreshCw, X, Check, UserPlus } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
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

export function LoyaltyMembershipsView() {
  const [tab, setTab] = useState<"loyalty" | "memberships">("loyalty");

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        items={[
          { key: "loyalty", label: "Loyalty" },
          { key: "memberships", label: "Memberships" },
        ]}
        value={tab}
        onChange={(k) => setTab(k as "loyalty" | "memberships")}
        className="max-w-xs"
      />
      {tab === "loyalty" ? <LoyaltyTab /> : <MembershipsTab />}
    </div>
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
      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  if (!programs || programs.length === 0) {
    return (
      <>
        <EmptyState icon={Stamp} title="No loyalty program yet" description="Set up a punch-card or tier program to start rewarding repeat customers." action={{ label: "Create program", onClick: () => setNewProgramOpen(true) }} />
        <NewProgramDialog open={newProgramOpen} onClose={() => setNewProgramOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={activeProgramId} onChange={(e) => setProgramId(e.target.value)} className="w-56">
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.type === "punch_card" ? `${p.stampsRequired} stamps` : "tiers"})
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEnrollOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Enroll customer
          </Button>
          <Button size="sm" onClick={() => setNewProgramOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New program
          </Button>
        </div>
      </div>

      {program?.rewardDescription && <p className="text-xs text-fg-faint">Reward: {program.rewardDescription}</p>}

      <Card>
        <CardContent className="p-0">
          {membersPending && (
            <div className="flex flex-col gap-1 p-4">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}
          {members && members.length === 0 && <EmptyState icon={Gift} title="No members yet" description="Enroll a customer to start issuing real stamps on their purchases." />}
          {members && members.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-faint">
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Progress</th>
                    <th className="px-4 py-2 text-end font-medium">Redeemed</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((m) => {
                    const eligible = program?.type === "punch_card" && m.stampCount >= (program?.stampsRequired ?? Infinity);
                    return (
                      <tr key={m.id}>
                        <td className="px-4 py-2 font-medium text-fg">{m.customer.name}</td>
                        <td className="px-4 py-2 text-fg-muted">
                          {program?.type === "punch_card" ? (
                            <span className="tabular-nums">
                              {m.stampCount} / {program.stampsRequired} stamps
                            </span>
                          ) : (
                            <Badge tone={m.currentTier ? "primary" : "neutral"}>{m.currentTier ?? "No tier yet"}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-end tabular-nums text-fg-muted">{m.redeemedCount}</td>
                        <td className="px-4 py-2 text-end">
                          {program?.type === "punch_card" && (
                            <Button size="sm" variant={eligible ? "primary" : "ghost"} disabled={!eligible || redeemMutation.isPending} onClick={() => redeemMutation.mutate(m.id)}>
                              <Gift className="h-3.5 w-3.5" aria-hidden />
                              Redeem
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <>
        <EmptyState icon={Gift} title="No membership plan yet" description="Create a recurring plan customers can enroll in with cash or a real Stripe subscription." action={{ label: "Create plan", onClick: () => setNewPlanOpen(true) }} />
        <NewPlanDialog open={newPlanOpen} onClose={() => setNewPlanOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setEnrollOpen(true)}>
          <UserPlus className="h-3.5 w-3.5" aria-hidden />
          Enroll customer
        </Button>
        <Button size="sm" onClick={() => setNewPlanOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New plan
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {(!memberships || memberships.length === 0) && <EmptyState icon={Gift} title="No memberships yet" description="Enroll a customer above." />}
          {memberships && memberships.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-faint">
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Plan</th>
                    <th className="px-4 py-2 font-medium">Method</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Due</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {memberships.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2 font-medium text-fg">{m.customer.name}</td>
                      <td className="px-4 py-2 text-fg-muted">{planById.get(m.planId)?.name ?? m.plan.name}</td>
                      <td className="px-4 py-2 text-fg-muted capitalize">{m.method}</td>
                      <td className="px-4 py-2">
                        <Badge tone={m.status === "active" ? "success" : m.status === "pending" ? "warning" : m.status === "expired" ? "danger" : "neutral"}>{m.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-fg-muted">{m.currentPeriodEnd ? formatDate(m.currentPeriodEnd) : "—"}</td>
                      <td className="px-4 py-2 text-end">
                        <div className="flex justify-end gap-1">
                          {m.status === "pending" && m.method === "online" && (
                            <Button size="sm" variant="ghost" onClick={() => activateMutation.mutate(m.id)} disabled={activateMutation.isPending}>
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Activate
                            </Button>
                          )}
                          {m.method === "cash" && (m.status === "active" || m.status === "expired") && (
                            <Button size="sm" variant="ghost" onClick={() => renewMutation.mutate(m.id)} disabled={renewMutation.isPending}>
                              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                              Renew
                            </Button>
                          )}
                          {(m.status === "active" || m.status === "pending") && (
                            <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(m.id)} disabled={cancelMutation.isPending}>
                              <X className="h-3.5 w-3.5" aria-hidden />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
