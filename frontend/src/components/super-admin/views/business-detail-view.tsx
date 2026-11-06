"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { saApi } from "@/lib/super-admin-api";
import { useAdminCan } from "@/store/super-admin-auth-store";
import {
  ActionDialog,
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  fmtAgo,
  fmtDate,
  fmtDateTime,
  fmtNum,
  KeyValue,
  Loading,
  Meter,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
} from "../ui";
import { TenantUsersTab, TenantSecurityTab, TenantIntegrationsTab, TenantActivityTab, TenantNotesTab } from "./tenant-tabs";
import { TenantSubscriptionTab, TenantLimitsTab, TenantModulesTab, TenantAiTab } from "./tenant-entitlement-tabs";

const KEY_METRICS = ["users", "locations", "ai_credits", "emails", "sms_segments", "whatsapp_messages", "storage_bytes"];

export function BusinessDetailView({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab") ?? "overview";
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ["sa", "tenant", id], queryFn: () => saApi.tenant(id) });
  const canSuspend = useAdminCan("businesses.suspend");
  const canSessions = useAdminCan("sessions.manage");
  const [dialog, setDialog] = useState<null | "status" | "sessions">(null);
  const [nextStatus, setNextStatus] = useState("suspended");

  const can = {
    users: useAdminCan("users.view"),
    sub: useAdminCan("subscriptions.view"),
    limits: useAdminCan("limits.view"),
    modules: useAdminCan("modules.view"),
    activity: useAdminCan("activity.view"),
    security: useAdminCan("security.view"),
    integrations: useAdminCan("integrations.view"),
    ai: useAdminCan("ai.view"),
    notes: useAdminCan("businesses.notes"),
  };

  if (detail.isPending) return <Loading />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const d = detail.data;
  const b = d.business;
  const refresh = () => qc.invalidateQueries({ queryKey: ["sa"] });
  const setTab = (k: string) => router.replace(`/super-admin/businesses/${id}?tab=${k}`, { scroll: false });

  return (
    <>
      <Link href="/super-admin/businesses" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>
        <ArrowLeft className="h-3.5 w-3.5" /> Businesses
      </Link>
      <PageHeader
        title={b.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={b.platformStatus} /> <StatusBadge status={d.entitlements.status} /> {d.entitlements.planName}
            <span className="font-mono text-[11px]">{b.id}</span>
          </span>
        }
        actions={
          <>
            {canSessions && (
              <Button variant="outline" onClick={() => setDialog("sessions")}>
                Sign out all users
              </Button>
            )}
            {canSuspend && (
              <Button
                variant={b.platformStatus === "active" ? "danger" : "primary"}
                onClick={() => {
                  setNextStatus(b.platformStatus === "active" ? "suspended" : "active");
                  setDialog("status");
                }}
              >
                {b.platformStatus === "active" ? "Suspend / archive" : "Reactivate"}
              </Button>
            )}
          </>
        }
      />
      {b.platformStatus !== "active" && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-[13px]" style={{ background: "#fef3f2", borderColor: "#fecdca", color: "var(--app-danger-strong)" }}>
          {b.platformStatus === "archived" ? "Archived" : "Suspended"} {fmtDateTime(b.platformStatusAt)}: {b.platformStatusReason ?? "—"}. Nobody in this business can sign in or use the app; no data has been deleted.
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "users", label: "Users", hidden: !can.users },
          { key: "subscription", label: "Subscription", hidden: !can.sub },
          { key: "limits", label: "Usage & limits", hidden: !can.limits },
          { key: "modules", label: "Modules & access", hidden: !can.modules },
          { key: "ai", label: "AI credits", hidden: !can.ai },
          { key: "activity", label: "Activity", hidden: !can.activity },
          { key: "security", label: "Security", hidden: !can.security },
          { key: "integrations", label: "Integrations", hidden: !can.integrations },
          { key: "notes", label: `Internal notes${d.notesCount ? ` (${d.notesCount})` : ""}`, hidden: !can.notes },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Business profile">
            <KeyValue
              rows={[
                ["Type", b.type ?? "—"],
                ["Email", b.email ?? "—"],
                ["Phone", b.phone ?? "—"],
                ["Website", b.website ?? "—"],
                ["Location", [b.city, b.country].filter(Boolean).join(", ") || "—"],
                ["Currency / timezone", `${b.currency} · ${b.timezone}`],
                ["Registered", fmtDateTime(b.createdAt)],
                ["Onboarding", b.onboardingCompletedAt ? `Completed ${fmtDate(b.onboardingCompletedAt)}` : "Not finished"],
                ["Stripe customer", b.hasStripeCustomer ? "Linked" : "None"],
              ]}
            />
          </Card>
          <Card title="Owner & access">
            <KeyValue
              rows={[
                ["Owner", d.owner ? <Link className="font-semibold hover:underline" href={`/super-admin/users/${d.owner.id}`}>{d.owner.name}</Link> : "—"],
                ["Owner email", d.owner?.email ?? "—"],
                ["Owner 2FA", d.owner ? (d.owner.twoFactorEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>) : "—"],
                ["Last sign-in", fmtDateTime(d.lastLoginAt)],
                ["Last active", fmtAgo(d.lastActiveAt)],
                ["Locations", `${b.branches.length + 1} (${b.branches.filter((x) => x.active).length + 1} active)`],
                ["Modules on", `${d.modules.enabled} of ${d.modules.total}`],
                ["High-severity security events (7d)", d.highSeverityEvents7d ? <Badge tone="danger">{d.highSeverityEvents7d}</Badge> : "0"],
              ]}
            />
          </Card>
          <Card title="Subscription">
            <KeyValue
              rows={[
                ["Plan", d.entitlements.planName],
                ["Status", <StatusBadge key="s" status={d.entitlements.status} />],
                ["Billing", d.entitlements.interval === "year" ? "Yearly" : "Monthly"],
                ["Period", `${fmtDate(d.entitlements.billingPeriod.start)} → ${fmtDate(d.entitlements.billingPeriod.end)}`],
                ["Trial ends", fmtDate(d.entitlements.trialEndsAt)],
                ["Cancels at period end", d.entitlements.cancelAtPeriodEnd ? "Yes" : "No"],
                ["Read-only (billing)", d.entitlements.suspended ? <Badge tone="danger">Yes</Badge> : "No"],
              ]}
            />
          </Card>
          <Card title="Usage this period" className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              {KEY_METRICS.filter((k) => d.entitlements.metrics[k]).map((k) => {
                const m = d.entitlements.metrics[k];
                const limit = m.included == null ? null : m.included + m.purchased;
                return (
                  <div key={k}>
                    <div className="flex justify-between text-[12.5px]">
                      <span style={{ color: "var(--app-text-muted)" }}>
                        {k.replace(/_/g, " ")} {m.override && <Badge tone="info">Override</Badge>}
                      </span>
                      <span className="font-bold" style={{ color: "var(--app-text)" }}>
                        {fmtNum(m.used)} / {limit == null ? "Not configured" : fmtNum(limit)}
                      </span>
                    </div>
                    <Meter used={m.used + m.reserved} limit={limit} />
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="Recent activity">
            {d.recentActivity.length === 0 ? (
              <p className="m-0 text-[13px]" style={{ color: "var(--app-text-faintest)" }}>No activity recorded yet.</p>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0">
                {d.recentActivity.map((a) => (
                  <li key={a.id} className="text-[12.5px]">
                    <span style={{ color: "var(--app-text-muted)" }}>{a.description}</span>
                    <span className="ms-1.5" style={{ color: "var(--app-text-faintest)" }}>{fmtAgo(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {b.branches.length > 0 && (
            <Card title="Branches" className="lg:col-span-3">
              <div className="flex flex-wrap gap-2">
                {b.branches.map((br) => (
                  <Badge key={br.id} tone={br.active ? "success" : "neutral"}>{br.name}</Badge>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
      {tab === "users" && <TenantUsersTab id={id} />}
      {tab === "subscription" && <TenantSubscriptionTab id={id} />}
      {tab === "limits" && <TenantLimitsTab id={id} />}
      {tab === "modules" && <TenantModulesTab id={id} />}
      {tab === "ai" && <TenantAiTab id={id} />}
      {tab === "activity" && <TenantActivityTab id={id} />}
      {tab === "security" && <TenantSecurityTab id={id} />}
      {tab === "integrations" && <TenantIntegrationsTab id={id} />}
      {tab === "notes" && <TenantNotesTab id={id} />}

      {dialog === "status" && (
        <ActionDialog
          title={nextStatus === "active" ? `Reactivate ${b.name}` : `Restrict ${b.name}`}
          danger={nextStatus !== "active"}
          reauth
          confirmLabel={nextStatus === "active" ? "Reactivate" : nextStatus === "archived" ? "Archive" : "Suspend"}
          description={
            nextStatus === "active"
              ? "Everyone in this business can sign in and use Noxtill again."
              : nextStatus === "archived"
                ? "Archive blocks all access and signs every device out. Data is kept; nothing is deleted."
                : "Suspension blocks every sign-in and every live session for the whole business on the very next request. Data is kept."
          }
          onClose={() => setDialog(null)}
          onConfirm={async (auth) => {
            await saApi.setTenantStatus(id, { status: nextStatus, ...auth });
            toast.success("Business status updated");
            await refresh();
          }}
        >
          {b.platformStatus === "active" && (
            <Field label="Action">
              <Select label="Action" value={nextStatus} onChange={setNextStatus} options={[{ value: "suspended", label: "Suspend (temporary)" }, { value: "archived", label: "Archive (and sign everyone out)" }]} />
            </Field>
          )}
        </ActionDialog>
      )}
      {dialog === "sessions" && (
        <ActionDialog
          title="Sign out every user of this business"
          danger
          reauth
          confirmLabel="Sign everyone out"
          description="Every open session in this business and its branches is revoked immediately. People can sign in again."
          onClose={() => setDialog(null)}
          onConfirm={async (auth) => {
            const r = await saApi.revokeTenantSessions(id, auth);
            toast.success(`${r.revoked} session(s) revoked`);
            await refresh();
          }}
        />
      )}
    </>
  );
}
