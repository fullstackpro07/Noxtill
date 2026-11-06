"use client";

import { Fragment, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { downloadCsv, qs, saApi, type AdminRow, type RolesResponse } from "@/lib/super-admin-api";
import { useSuperAdminAuth } from "@/store/super-admin-auth-store";
import {
  ActionDialog,
  Badge,
  Button,
  Card,
  DateInput,
  Empty,
  ErrorState,
  Field,
  fmtAgo,
  fmtDateTime,
  humanize,
  inputCls,
  inputStyle,
  Loading,
  PageHeader,
  Pagination,
  SearchBox,
  Select,
  StatusBadge,
  Table,
  Td,
} from "../ui";

function OneTimePassword({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  return (
    <ActionDialog
      title="Temporary password"
      noReason
      confirmLabel="I have copied it"
      description={
        <>
          Give this to <b>{email}</b> through a secure channel. It is shown only once. They will be asked to enroll an authenticator app at first sign-in.
          <div className="mt-3 select-all rounded-lg border p-3 font-mono text-[14px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>
            {password}
          </div>
        </>
      }
      onClose={onClose}
      onConfirm={async () => undefined}
    />
  );
}

export function AdminUsersView() {
  const qc = useQueryClient();
  const me = useSuperAdminAuth((s) => s.admin);
  const admins = useQuery({ queryKey: ["sa", "admins"], queryFn: saApi.admins });
  const roles = useQuery({ queryKey: ["sa", "roles"], queryFn: saApi.roles });
  const [dialog, setDialog] = useState<null | { kind: "create" } | { kind: "edit" | "mfa" | "password" | "sessions"; admin: AdminRow }>(null);
  const [form, setForm] = useState({ email: "", name: "", roleKey: "analyst", status: "active" });
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["sa"] });
  const roleOpts = (roles.data?.roles ?? []).map((r) => ({ value: r.key, label: r.name }));

  return (
    <>
      <PageHeader
        title="Admin users"
        subtitle="Internal Noxtill administrators. Separate accounts from any business user; authenticator app required."
        actions={<Button onClick={() => { setForm({ email: "", name: "", roleKey: "analyst", status: "active" }); setDialog({ kind: "create" }); }}>Add admin</Button>}
      />
      <Card pad={false}>
        {admins.isPending && <Loading />}
        {admins.isError && <div className="p-4"><ErrorState error={admins.error} /></div>}
        {admins.data && (
          <Table head={["Admin", "Role", "Status", "Authenticator", "Last sign-in", "Open sessions", ""]}>
            {admins.data.map((a) => (
              <tr key={a.id}>
                <Td>
                  <div className="font-semibold" style={{ color: "var(--app-text)" }}>{a.name} {a.id === me?.id && <Badge tone="info">You</Badge>}</div>
                  <div className="text-[11.5px]">{a.email}</div>
                </Td>
                <Td>{a.roleName}</Td>
                <Td>
                  <StatusBadge status={a.status} /> {a.lockedUntil && new Date(a.lockedUntil) > new Date() && <Badge tone="warning">Locked</Badge>}
                </Td>
                <Td>{a.mfaEnrolled ? <Badge tone="success">Enrolled</Badge> : <Badge tone="warning">Not yet</Badge>}</Td>
                <Td>{fmtAgo(a.lastLoginAt)}</Td>
                <Td>{a.activeSessions}</Td>
                <Td className="whitespace-nowrap">
                  {a.id !== me?.id && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => { setForm({ email: a.email, name: a.name, roleKey: a.roleKey, status: a.status }); setDialog({ kind: "edit", admin: a }); }}>Edit</Button>{" "}
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "mfa", admin: a })}>Reset 2FA</Button>{" "}
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "password", admin: a })}>Reset password</Button>{" "}
                    </>
                  )}
                  {a.activeSessions > 0 && <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "sessions", admin: a })}>Sign out</Button>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {dialog?.kind === "create" && (
        <ActionDialog
          title="Add an admin"
          reauth
          confirmLabel="Create admin"
          canConfirm={!!form.email && !!form.name}
          onClose={() => setDialog(null)}
          onConfirm={async (auth) => {
            const r = await saApi.createAdmin({ email: form.email, name: form.name, roleKey: form.roleKey, ...auth });
            setSecret({ email: form.email, password: r.temporaryPassword });
            await refresh();
          }}
        >
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} style={inputStyle} /></Field>
          <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} style={inputStyle} /></Field>
          <Field label="Role"><Select label="Role" value={form.roleKey} onChange={(v) => setForm({ ...form, roleKey: v })} options={roleOpts} /></Field>
        </ActionDialog>
      )}
      {dialog?.kind === "edit" && (
        <ActionDialog
          title={`Edit ${dialog.admin.name}`}
          reauth
          confirmLabel="Save"
          description="Disabling an admin signs them out everywhere immediately."
          onClose={() => setDialog(null)}
          onConfirm={async (auth) => {
            await saApi.updateAdmin(dialog.admin.id, {
              name: form.name !== dialog.admin.name ? form.name : undefined,
              roleKey: form.roleKey !== dialog.admin.roleKey ? form.roleKey : undefined,
              status: form.status !== dialog.admin.status ? form.status : undefined,
              ...auth,
            });
            toast.success("Admin updated");
            await refresh();
          }}
        >
          <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} style={inputStyle} /></Field>
          <Field label="Role"><Select label="Role" value={form.roleKey} onChange={(v) => setForm({ ...form, roleKey: v })} options={roleOpts} /></Field>
          <Field label="Status"><Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={[{ value: "active", label: "Active" }, { value: "disabled", label: "Disabled" }]} /></Field>
        </ActionDialog>
      )}
      {dialog?.kind === "mfa" && (
        <ActionDialog
          title={`Reset ${dialog.admin.name}'s authenticator`}
          danger
          reauth
          confirmLabel="Reset 2FA"
          description="Their sessions end and they must enroll a new authenticator at next sign-in. Use when a phone is lost."
          onClose={() => setDialog(null)}
          onConfirm={async (auth) => {
            await saApi.resetAdminMfa(dialog.admin.id, auth);
            toast.success("Authenticator reset");
            await refresh();
          }}
        />
      )}
      {dialog?.kind === "password" && (
        <ActionDialog
          title={`Reset ${dialog.admin.name}'s password`}
          danger
          reauth
          confirmLabel="Reset password"
          description="A new temporary password is generated and shown once; their sessions end."
          onClose={() => setDialog(null)}
          onConfirm={async (auth) => {
            const r = await saApi.resetAdminPassword(dialog.admin.id, auth);
            setSecret({ email: dialog.admin.email, password: r.temporaryPassword });
            await refresh();
          }}
        />
      )}
      {dialog?.kind === "sessions" && (
        <ActionDialog
          title={`Sign ${dialog.admin.name} out`}
          danger
          confirmLabel="Revoke sessions"
          description={dialog.admin.id === me?.id ? "Your other sessions end; this one stays." : undefined}
          onClose={() => setDialog(null)}
          onConfirm={async ({ reason }) => {
            const r = await saApi.revokeAdminSessions(dialog.admin.id, { reason });
            toast.success(`${r.revoked} session(s) revoked`);
            await refresh();
          }}
        />
      )}
      {secret && <OneTimePassword email={secret.email} password={secret.password} onClose={() => setSecret(null)} />}
    </>
  );
}

export function AdminRolesView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sa", "roles"], queryFn: saApi.roles });
  const [editing, setEditing] = useState<RolesResponse["roles"][number] | "new" | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const { roles, permissions } = q.data;
  return (
    <>
      <PageHeader
        title="Admin roles & permissions"
        subtitle="Internal admin permissions only — a separate system from business roles. Enforced by the server on every admin API call."
        actions={<Button onClick={() => { setEditing("new"); setPerms([]); setName(""); setKey(""); }}>New role</Button>}
      />
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="sticky start-0 border-b px-3 py-2.5 text-start" style={{ background: "var(--app-surface-2)", borderColor: "var(--app-border)" }}>Permission</th>
                {roles.map((r) => (
                  <th key={r.key} className="whitespace-nowrap border-b px-3 py-2.5 text-center" style={{ background: "var(--app-surface-2)", borderColor: "var(--app-border)" }}>
                    <div>{r.name}</div>
                    <div className="text-[10.5px] font-normal">{r.admins} admin(s)</div>
                    {!r.locked && <button type="button" className="text-[11px] font-bold underline" onClick={() => { setEditing(r); setPerms(r.permissions); setName(r.name); setKey(r.key); }}>Edit</button>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <tr key={p.key}>
                  <td className="border-b px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                    {p.label}
                    <div className="font-mono text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{p.key}</div>
                  </td>
                  {roles.map((r) => (
                    <td key={r.key} className="border-b px-3 py-2 text-center" style={{ borderColor: "var(--app-border)" }}>
                      {r.permissions.includes(p.key) ? <span style={{ color: "var(--app-success-text)" }} aria-label="Yes">●</span> : <span style={{ color: "var(--app-text-disabled)" }} aria-label="No">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <ActionDialog
          title={editing === "new" ? "New admin role" : `Edit ${editing.name}`}
          reauth
          confirmLabel="Save role"
          canConfirm={editing !== "new" || (/^[a-z0-9_]{2,32}$/.test(key) && !!name.trim())}
          onClose={() => setEditing(null)}
          onConfirm={async (auth) => {
            await saApi.saveRole(editing === "new" ? key : editing.key, { name, permissions: perms, ...auth });
            toast.success("Role saved");
            await qc.invalidateQueries({ queryKey: ["sa"] });
          }}
        >
          {editing === "new" && (
            <Field label="Role key" hint="Lower-case letters, digits, underscores.">
              <input value={key} onChange={(e) => setKey(e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          )}
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={inputStyle} /></Field>
          <div className="max-h-[38vh] space-y-1 overflow-y-auto rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
            {permissions.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={perms.includes(p.key)} onChange={(e) => setPerms(e.target.checked ? [...perms, p.key] : perms.filter((x) => x !== p.key))} />
                {p.label}
              </label>
            ))}
          </div>
        </ActionDialog>
      )}
    </>
  );
}

export function AuditLogView() {
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const filters = { action, resourceType, businessId: businessId.trim(), from, to };
  const q = useQuery({ queryKey: ["sa", "audit", filters, page], queryFn: () => saApi.auditLog({ ...filters, page, pageSize: 50 }), placeholderData: keepPreviousData });
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };
  return (
    <>
      <PageHeader
        title="Admin audit log"
        subtitle="Every privileged admin action — append-only; the database refuses edits and deletions."
        actions={
          <Button variant="outline" onClick={async () => {
            try {
              await downloadCsv(`/admins/audit/export${qs(filters)}`, "noxtill-admin-audit.csv");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
          <SearchBox value={action} onChange={reset(setAction)} placeholder="Action contains… (e.g. suspended)" />
          <Select label="Resource" value={resourceType} onChange={reset(setResourceType)} options={[{ value: "", label: "Any resource" }, ...["business", "user", "membership", "session", "subscription", "plan", "entitlement_override", "module", "credit_balance", "admin", "admin_role", "internal_note", "export"].map((r) => ({ value: r, label: humanize(r) }))]} />
          <SearchBox value={businessId} onChange={reset(setBusinessId)} placeholder="Business ID" />
          <DateInput label="From" value={from} onChange={reset(setFrom)} />
          <DateInput label="To" value={to} onChange={reset(setTo)} />
        </div>
        {q.isPending && <Loading />}
        {q.isError && <div className="p-4"><ErrorState error={q.error} /></div>}
        {q.data && (
          <>
            <Table head={["When", "Admin", "Action", "Resource", "Reason", "IP / request", ""]} empty={q.data.items.length === 0 && <Empty>No admin actions match.</Empty>}>
              {q.data.items.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <Td className="whitespace-nowrap">{fmtDateTime(a.createdAt)}</Td>
                    <Td>{a.adminEmail}</Td>
                    <Td>{humanize(a.action)}</Td>
                    <Td mono>{a.resourceType}{a.resourceId ? `:${a.resourceId.slice(0, 12)}` : ""}</Td>
                    <Td className="max-w-[300px]">{a.reason}</Td>
                    <Td mono>{a.ipAddress ?? "—"}<div className="text-[10.5px]">{a.requestId ?? ""}</div></Td>
                    <Td><Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide" : "Before / after"}</Button></Td>
                  </tr>
                  {open === a.id && (
                    <tr>
                      <td colSpan={7} className="border-b px-3 py-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
                        <div className="grid gap-3 md:grid-cols-2">
                          <pre className="m-0 overflow-x-auto whitespace-pre-wrap text-[11.5px]"><b>Before</b>{"\n"}{JSON.stringify(a.before, null, 2) ?? "—"}</pre>
                          <pre className="m-0 overflow-x-auto whitespace-pre-wrap text-[11.5px]"><b>After</b>{"\n"}{JSON.stringify(a.after, null, 2) ?? "—"}</pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </Table>
            <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
