"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { saApi } from "@/lib/super-admin-api";
import { useAdminCan } from "@/store/super-admin-auth-store";
import { useDebounced } from "../use-debounced";
import {
  ActionDialog,
  Badge,
  Button,
  Card,
  DateInput,
  Empty,
  ErrorState,
  fmtAgo,
  fmtDate,
  fmtDateTime,
  humanize,
  KeyValue,
  Loading,
  PageHeader,
  Pagination,
  RowLink,
  SearchBox,
  Select,
  StatusBadge,
  Table,
  Td,
} from "../ui";
import { SecurityEventsTable } from "./tenant-tabs";

export function UsersView() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [mfa, setMfa] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const params = { search: q, role, status, mfa, inactiveDays, createdFrom, createdTo, page, pageSize: 25 };
  const list = useQuery({ queryKey: ["sa", "users", params], queryFn: () => saApi.users(params), placeholderData: keepPreviousData });
  const set = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };
  return (
    <>
      <PageHeader title="Users" subtitle="Every person with a Noxtill account, across all businesses." />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
          <SearchBox value={search} onChange={set(setSearch)} placeholder="Name, email, phone or user ID" />
          <Select label="Role" value={role} onChange={set(setRole)} options={[{ value: "", label: "Any role" }, { value: "owner", label: "Owner" }, { value: "manager", label: "Manager" }, { value: "staff", label: "Staff" }]} />
          <Select label="Status" value={status} onChange={set(setStatus)} options={[{ value: "", label: "Any status" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }, { value: "locked", label: "Locked out" }]} />
          <Select label="MFA" value={mfa} onChange={set(setMfa)} options={[{ value: "", label: "Any 2FA" }, { value: "on", label: "2FA on" }, { value: "off", label: "2FA off" }]} />
          <Select label="Last login" value={inactiveDays} onChange={set(setInactiveDays)} options={[{ value: "", label: "Any activity" }, { value: "30", label: "Inactive 30+ days" }, { value: "90", label: "Inactive 90+ days" }]} />
          <DateInput label="Registered from" value={createdFrom} onChange={set(setCreatedFrom)} />
          <DateInput label="to" value={createdTo} onChange={set(setCreatedTo)} />
        </div>
        {list.isPending && <Loading />}
        {list.isError && <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>}
        {list.data && (
          <>
            <Table head={["User", "Email / phone", "Business", "Role", "Account", "2FA", "Registered", "Last login"]} empty={list.data.items.length === 0 && <Empty>No users match.</Empty>}>
              {list.data.items.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <RowLink href={`/super-admin/users/${u.id}`}>{u.name}</RowLink>
                    <div className="font-mono text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{u.id}</div>
                  </Td>
                  <Td>
                    <div>{u.email ?? "—"}</div>
                    <div className="text-[11.5px]">{u.phone ?? ""}</div>
                  </Td>
                  <Td>
                    {u.business && u.tenantId ? <Link className="hover:underline" href={`/super-admin/businesses/${u.tenantId}`}>{u.business.name}</Link> : "—"}
                    {u.memberships > 1 && <div className="text-[11px]">+{u.memberships - 1} more</div>}
                  </Td>
                  <Td>{humanize(u.role)}</Td>
                  <Td>
                    <StatusBadge status={u.platformStatus} /> {u.locked && <Badge tone="warning">Locked</Badge>}
                    {u.membershipActive === false && <Badge>Deactivated</Badge>}
                  </Td>
                  <Td>{u.mfa ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</Td>
                  <Td>{fmtDate(u.createdAt)}</Td>
                  <Td>{fmtAgo(u.lastLoginAt)}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

export function UserDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa", "user", id], queryFn: () => saApi.user(id) });
  const canManage = useAdminCan("users.manage");
  const canSessions = useAdminCan("sessions.manage");
  const [dialog, setDialog] = useState<null | "status" | "reset" | "revokeAll" | { session: string }>(null);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { user: u, sessions, security, activity, changes } = q.data;
  const open = sessions.filter((s) => !s.revokedAt);
  const refresh = () => qc.invalidateQueries({ queryKey: ["sa"] });

  return (
    <>
      <Link href="/super-admin/users" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>
        <ArrowLeft className="h-3.5 w-3.5" /> Users
      </Link>
      <PageHeader
        title={u.name}
        subtitle={<span className="font-mono text-[11px]">{u.id}</span>}
        actions={
          <>
            {canManage && u.email && <Button variant="outline" onClick={() => setDialog("reset")}>Send password reset</Button>}
            {canSessions && open.length > 0 && <Button variant="outline" onClick={() => setDialog("revokeAll")}>Sign out everywhere</Button>}
            {canManage && (
              <Button variant={u.platformStatus === "active" ? "danger" : "primary"} onClick={() => setDialog("status")}>
                {u.platformStatus === "active" ? "Suspend user" : "Restore user"}
              </Button>
            )}
          </>
        }
      />
      {u.platformStatus !== "active" && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-[13px]" style={{ background: "#fef3f2", borderColor: "#fecdca", color: "var(--app-danger-strong)" }}>
          Suspended {fmtDateTime(u.platformStatusAt)}: {u.platformStatusReason ?? "—"}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Personal information">
          <KeyValue
            rows={[
              ["Email", u.email ? <>{u.email} {u.emailVerifiedAt ? <Badge tone="success">Verified</Badge> : <Badge>Unverified</Badge>}</> : "—"],
              ["Phone", u.phone ?? "—"],
              ["Account created", fmtDateTime(u.createdAt)],
              ["Sign-in providers", u.signInProviders.length ? u.signInProviders.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ") : "None"],
              ["Passkeys", u.passkeys ? String(u.passkeys) : "None"],
              ["Profile image", "Not stored by Noxtill"],
            ]}
          />
        </Card>
        <Card title="Security">
          <KeyValue
            rows={[
              ["Account", <StatusBadge key="s" status={u.platformStatus} />],
              ["2FA (WhatsApp code)", u.twoFactorEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>],
              ["Failed attempts", String(u.failedLoginAttempts)],
              ["Locked until", u.lockedUntil && new Date(u.lockedUntil) > new Date() ? fmtDateTime(u.lockedUntil) : "Not locked"],
              ["Open sessions", String(open.length)],
            ]}
          />
        </Card>
        <Card title="Businesses & roles">
          <ul className="m-0 list-none space-y-2 p-0">
            {u.businessUsers.map((m) => (
              <li key={m.id} className="text-[13px]">
                <Link className="font-semibold hover:underline" href={`/super-admin/businesses/${m.business.parentId ?? m.business.id}?tab=users`}>
                  {m.business.name}
                </Link>{" "}
                · {humanize(m.role)}
                {m.customRole && ` (${m.customRole.name})`} {!m.active && <Badge>Deactivated</Badge>}
                {m.business.platformStatus !== "active" && <Badge tone="danger">Business {m.business.platformStatus}</Badge>}
              </li>
            ))}
            {u.businessUsers.length === 0 && <li className="text-[13px]">No business membership.</li>}
          </ul>
        </Card>
      </div>

      <Card title="Sessions (sign-in history)" pad={false} className="mt-4">
        <Table head={["Signed in", "IP address", "Device", "Last used", "State", ""]} empty={sessions.length === 0 && <Empty>No sessions.</Empty>}>
          {sessions.map((s) => (
            <tr key={s.id}>
              <Td className="whitespace-nowrap">{fmtDateTime(s.createdAt)}</Td>
              <Td mono>{s.ipAddress ?? "Not recorded"}</Td>
              <Td className="max-w-[320px] truncate">{s.userAgent ?? "Not recorded"}</Td>
              <Td>{fmtAgo(s.lastUsedAt)}</Td>
              <Td>{s.revokedAt ? <Badge>Signed out {fmtDate(s.revokedAt)}</Badge> : <Badge tone="success">Open</Badge>}</Td>
              <Td>{canSessions && !s.revokedAt && <Button size="sm" variant="ghost" onClick={() => setDialog({ session: s.id })}>Revoke</Button>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Security events" pad={false} className="mt-4">
        <SecurityEventsTable events={security} />
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Recent product activity" pad={false}>
          <Table head={["When", "Type", "Description"]} empty={activity.length === 0 && <Empty>No activity attributed to this user.</Empty>}>
            {activity.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap">{fmtDateTime(a.createdAt)}</Td>
                <Td>{humanize(a.type)}</Td>
                <Td>{a.description}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Recent record changes" pad={false}>
          <Table head={["When", "Action", "Record"]} empty={changes.length === 0 && <Empty>No audited changes by this user.</Empty>}>
            {changes.map((c) => (
              <tr key={c.id}>
                <Td className="whitespace-nowrap">{fmtDateTime(c.createdAt)}</Td>
                <Td>{c.action}</Td>
                <Td mono>{c.entity}:{c.entityId}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      {dialog === "status" && (
        <ActionDialog
          title={u.platformStatus === "active" ? `Suspend ${u.name}` : `Restore ${u.name}`}
          danger={u.platformStatus === "active"}
          confirmLabel={u.platformStatus === "active" ? "Suspend" : "Restore"}
          description={u.platformStatus === "active" ? "They are blocked from signing in, and every live session stops working on its next request — in every business they belong to." : "They can sign in again."}
          onClose={() => setDialog(null)}
          onConfirm={async ({ reason }) => {
            await saApi.setUserStatus(id, { status: u.platformStatus === "active" ? "suspended" : "active", reason });
            toast.success("User updated");
            await refresh();
          }}
        />
      )}
      {dialog === "reset" && (
        <ActionDialog
          title="Send a password reset link"
          confirmLabel="Send link"
          description={`A one-time reset link is emailed to ${u.email}. You never see or set their password.`}
          onClose={() => setDialog(null)}
          onConfirm={async ({ reason }) => {
            const r = await saApi.sendPasswordReset(id, { reason });
            if (r.sent) toast.success("Reset link sent");
            else toast.error("The email could not be sent (email delivery is not configured).");
          }}
        />
      )}
      {dialog === "revokeAll" && (
        <ActionDialog
          title="Sign out everywhere"
          danger
          confirmLabel="Revoke all sessions"
          onClose={() => setDialog(null)}
          onConfirm={async ({ reason }) => {
            const r = await saApi.revokeUserSessions(id, { reason });
            toast.success(`${r.revoked} session(s) revoked`);
            await refresh();
          }}
        />
      )}
      {dialog && typeof dialog === "object" && (
        <ActionDialog
          title="Revoke this session"
          danger
          confirmLabel="Revoke"
          onClose={() => setDialog(null)}
          onConfirm={async ({ reason }) => {
            await saApi.revokeUserSession(id, dialog.session, { reason });
            toast.success("Session revoked");
            await refresh();
          }}
        />
      )}
    </>
  );
}
