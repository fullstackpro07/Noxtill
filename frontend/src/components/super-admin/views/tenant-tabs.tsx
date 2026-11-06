"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saApi, type TenantUserRow } from "@/lib/super-admin-api";
import { useAdminCan } from "@/store/super-admin-auth-store";
import {
  ActionDialog,
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  fmtAgo,
  fmtDateTime,
  humanize,
  inputCls,
  inputStyle,
  Loading,
  Pagination,
  Select,
  StatusBadge,
  Table,
  Td,
} from "../ui";

export function TenantUsersTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa", "tenant", id, "users"], queryFn: () => saApi.tenantUsers(id) });
  const canManage = useAdminCan("users.manage");
  const [roleFor, setRoleFor] = useState<TenantUserRow | null>(null);
  const [activeFor, setActiveFor] = useState<TenantUserRow | null>(null);
  const [role, setRole] = useState("staff");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <Card pad={false}>
      <Table head={["Person", "Role", "Location", "Membership", "Account", "2FA", "Last sign-in", "Joined", ""]} empty={q.data.length === 0 && <Empty>No users.</Empty>}>
        {q.data.map((r) => (
          <tr key={r.membershipId}>
            <Td>
              <Link className="font-semibold hover:underline" style={{ color: "var(--app-text)" }} href={`/super-admin/users/${r.user.id}`}>
                {r.user.name}
              </Link>
              <div className="text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>{r.user.email ?? r.user.phone ?? "—"}</div>
            </Td>
            <Td>
              {humanize(r.role)}
              {r.customRole && <div className="text-[11.5px]">{r.customRole}</div>}
            </Td>
            <Td>{r.location.name}</Td>
            <Td>{r.membershipActive ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}</Td>
            <Td>
              <StatusBadge status={r.user.platformStatus} />
              {r.user.lockedUntil && new Date(r.user.lockedUntil) > new Date() && <Badge tone="warning">Locked</Badge>}
            </Td>
            <Td>{r.user.twoFactorEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</Td>
            <Td>{fmtAgo(r.lastLoginAt)}</Td>
            <Td>{fmtDateTime(r.joinedAt)}</Td>
            <Td className="whitespace-nowrap">
              {canManage && r.role !== "owner" && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => { setRole(r.role === "staff" ? "manager" : "staff"); setRoleFor(r); }}>
                    Change role
                  </Button>{" "}
                  <Button size="sm" variant="ghost" onClick={() => setActiveFor(r)}>
                    {r.membershipActive ? "Deactivate" : "Activate"}
                  </Button>
                </>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      {roleFor && (
        <ActionDialog
          title={`Change ${roleFor.user.name}'s role`}
          confirmLabel="Change role"
          description="Ownership cannot be transferred from the admin console."
          onClose={() => setRoleFor(null)}
          onConfirm={async ({ reason }) => {
            await saApi.changeMembershipRole(roleFor.membershipId, { role, reason });
            toast.success("Role changed");
            await qc.invalidateQueries({ queryKey: ["sa"] });
          }}
        >
          <Field label="New role">
            <Select label="Role" value={role} onChange={setRole} options={[{ value: "manager", label: "Manager" }, { value: "staff", label: "Staff" }]} />
          </Field>
        </ActionDialog>
      )}
      {activeFor && (
        <ActionDialog
          title={`${activeFor.membershipActive ? "Deactivate" : "Activate"} ${activeFor.user.name} in this business`}
          danger={activeFor.membershipActive}
          confirmLabel={activeFor.membershipActive ? "Deactivate" : "Activate"}
          description="This is the business-level staff switch (same as the owner's own). Their history stays."
          onClose={() => setActiveFor(null)}
          onConfirm={async ({ reason }) => {
            await saApi.setMembershipActive(activeFor.membershipId, { active: !activeFor.membershipActive, reason });
            toast.success("Membership updated");
            await qc.invalidateQueries({ queryKey: ["sa"] });
          }}
        />
      )}
    </Card>
  );
}

export function TenantActivityTab({ id }: { id: string }) {
  const [source, setSource] = useState("activity");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["sa", "tenant", id, "activity", source, page],
    queryFn: () => saApi.tenantActivity(id, { source, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  return (
    <Card
      pad={false}
      title="Business activity"
      actions={
        <Select
          label="Source"
          value={source}
          onChange={(v) => { setSource(v); setPage(1); }}
          options={[{ value: "activity", label: "Product activity" }, { value: "changes", label: "Record changes (audit)" }, { value: "events", label: "Product events" }]}
        />
      }
    >
      {q.isPending && <Loading />}
      {q.isError && <div className="p-4"><ErrorState error={q.error} /></div>}
      {q.data && (
        <>
          <Table head={["When", "User", "Module", "Action", "Resource"]} empty={q.data.items.length === 0 && <Empty>Nothing recorded.</Empty>}>
            {q.data.items.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap">{fmtDateTime(a.createdAt)}</Td>
                <Td>{a.user?.name ?? "—"}</Td>
                <Td>{a.module ? humanize(a.module) : "—"}</Td>
                <Td>{a.action}</Td>
                <Td mono>{a.resource ?? "—"}</Td>
              </tr>
            ))}
          </Table>
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

export function TenantSecurityTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["sa", "tenant", id, "security"], queryFn: () => saApi.tenantSecurity(id) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-4">
      <Card title={`Open sessions (${q.data.sessions.length})`} pad={false}>
        <Table head={["User", "IP address", "Device", "Signed in", "Last used"]} empty={q.data.sessions.length === 0 && <Empty>No open sessions.</Empty>}>
          {q.data.sessions.map((s) => (
            <tr key={s.id}>
              <Td>{s.user ? <Link className="hover:underline" href={`/super-admin/users/${s.user.id}`}>{s.user.name}</Link> : "—"}</Td>
              <Td mono>{s.ipAddress ?? "Not recorded"}</Td>
              <Td className="max-w-[320px] truncate">{s.userAgent ?? "Not recorded"}</Td>
              <Td>{fmtDateTime(s.createdAt)}</Td>
              <Td>{fmtAgo(s.lastUsedAt)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Security events" pad={false}>
        <SecurityEventsTable events={q.data.events} />
      </Card>
    </div>
  );
}

export function SecurityEventsTable({ events }: { events: import("@/lib/super-admin-api").SecurityEventRow[] }) {
  return (
    <Table head={["When", "Severity", "Event", "User / identifier", "IP address", "Details"]} empty={events.length === 0 && <Empty>No security events recorded.</Empty>}>
      {events.map((e) => (
        <tr key={e.id}>
          <Td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</Td>
          <Td><StatusBadge status={e.severity} /></Td>
          <Td>{humanize(e.type)}</Td>
          <Td>
            {e.user ? <Link className="hover:underline" href={`/super-admin/users/${e.user.id}`}>{e.user.name}</Link> : e.identifier ?? "—"}
            {e.business && <div className="text-[11.5px]">{e.business.name}</div>}
          </Td>
          <Td mono>{e.ipAddress ?? "—"}</Td>
          <Td mono className="max-w-[280px] truncate">{e.metadata ? JSON.stringify(e.metadata) : "—"}</Td>
        </tr>
      ))}
    </Table>
  );
}

export function TenantIntegrationsTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["sa", "tenant", id, "integrations"], queryFn: () => saApi.tenantIntegrations(id) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-4">
      <Card title="Connections" pad={false}>
        <Table head={["Provider", "Status", "Connected", "Last sync", "Paused"]} empty={q.data.integrations.length === 0 && <Empty>No integrations set up.</Empty>}>
          {q.data.integrations.map((i) => (
            <tr key={i.id}>
              <Td>{humanize(i.provider)}</Td>
              <Td><StatusBadge status={i.status} /></Td>
              <Td>{fmtDateTime(i.connectedAt)}</Td>
              <Td>{fmtAgo(i.lastSyncAt)}</Td>
              <Td>{i.pausedAt ? fmtDateTime(i.pausedAt) : "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Recent sync runs" pad={false}>
        <Table head={["When", "Provider", "Result", "Processed", "Failed", "Message"]} empty={q.data.syncLogs.length === 0 && <Empty>No sync runs recorded.</Empty>}>
          {q.data.syncLogs.map((l) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</Td>
              <Td>{humanize(l.provider)}</Td>
              <Td>{l.success ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Failed</Badge>}</Td>
              <Td>{l.recordsProcessed}</Td>
              <Td>{l.recordsFailed}</Td>
              <Td className="max-w-[360px]">{l.message ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="m-0 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
        Access tokens and credentials are never shown here. Reconnecting is done by the business in its own Integrations screen (OAuth).
      </p>
    </div>
  );
}

export function TenantNotesTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa", "tenant", id, "notes"], queryFn: () => saApi.tenantNotes(id) });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Card title="Add a private note">
        <Field label="Note" hint="Visible only to Noxtill admins — never to anyone in the business.">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className={inputCls} style={inputStyle} />
        </Field>
        <Button
          className="mt-3"
          disabled={!body.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await saApi.addNote(id, body);
              setBody("");
              toast.success("Note saved");
              await qc.invalidateQueries({ queryKey: ["sa", "tenant", id] });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save note
        </Button>
      </Card>
      <Card title="Notes">
        {q.isPending && <Loading />}
        {q.isError && <ErrorState error={q.error} />}
        {q.data?.length === 0 && <Empty>No notes yet.</Empty>}
        <ul className="m-0 list-none space-y-3 p-0">
          {q.data?.map((n) => (
            <li key={n.id} className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
              <div className="whitespace-pre-wrap text-[13px]" style={{ color: "var(--app-text)" }}>{n.body}</div>
              <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
                {n.adminName} · {fmtDateTime(n.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
