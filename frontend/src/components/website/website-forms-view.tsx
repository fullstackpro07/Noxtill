"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FlaskConical, Plus, Save, Trash2 } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { websiteApi, type FormField, type WebsiteForm } from "@/lib/website-api";
import { Btn, Card, Empty, Field, Kpi, Notice, Page, StatusBadge, errorText, formatDate, inputClass, inputStyle } from "./website-ui";

const FIELD_TYPES: FormField["type"][] = ["text", "email", "phone", "textarea", "select", "checkbox"];
const MAP_LABELS: Record<FormField["mapTo"], string> = { name: "Customer name", phone: "Phone", email: "Email", address: "Address", notes: "Add to customer notes" };

type Draft = Pick<WebsiteForm, "name" | "fields" | "customerTag" | "consentText" | "thankYouMessage" | "status">;

const STARTER: Draft = {
  name: "Contact form",
  fields: [
    { key: "name", label: "Your name", type: "text", required: true, options: [], mapTo: "name" },
    { key: "phone", label: "Phone", type: "phone", required: true, options: [], mapTo: "phone" },
    { key: "message", label: "Message", type: "textarea", required: false, options: [], mapTo: "notes" },
  ],
  customerTag: "website-lead",
  consentText: "",
  thankYouMessage: "Thanks! We'll get back to you soon.",
  status: "active",
};

export function WebsiteFormsView() {
  useModuleHeader({ title: "Forms & Lead Capture", subtitle: "Website forms that create or update customers in your CRM" });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["website", "forms"], queryFn: websiteApi.forms });
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [testFor, setTestFor] = useState<WebsiteForm | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => (editing!.id ? websiteApi.updateForm(editing!.id, editing!.draft) : websiteApi.createForm(editing!.draft)),
    onSuccess: () => { setMessage({ tone: "ok", text: "Form saved." }); setEditing(null); void qc.invalidateQueries({ queryKey: ["website"] }); },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });

  const forms = q.data?.forms ?? [];
  const sum = (k: "accepted" | "spamBlocked" | "failed") => forms.reduce((n, f) => n + (f.last30Days?.[k] ?? 0), 0);

  return (
    <Page>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Active forms" value={forms.filter((f) => f.status === "active").length} />
        <Kpi label="Submissions (30d)" value={sum("accepted")} hint="Written to the CRM" />
        <Kpi label="Conversion rate" value="Not tracked" hint="Form views are not recorded" />
        <Kpi label="Spam blocked (30d)" value={sum("spamBlocked")} />
        <Kpi label="Failed (30d)" value={sum("failed")} tone={sum("failed") ? "danger" : undefined} />
      </div>

      <Card title="Forms" actions={<Btn variant="primary" onClick={() => setEditing({ id: null, draft: STARTER })}><Plus className="h-3.5 w-3.5" aria-hidden /> New form</Btn>}>
        {q.isLoading ? <p className="m-0 text-sm">Loading…</p> : q.isError ? <Notice tone="danger">{errorText(q.error)}</Notice> : forms.length === 0 ? (
          <Empty>No forms yet. Create one, then add it to a page with a Form block.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}><tr><th className="py-2 pr-2">Form</th><th className="py-2 pr-2">Status</th><th className="py-2 pr-2">Live on</th><th className="py-2 pr-2">Leads / spam / failed (30d)</th><th /></tr></thead>
              <tbody>
                {forms.map((f) => (
                  <tr key={f.id} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                    <td className="py-2 pr-2 font-semibold">{f.name}<br /><span className="font-normal" style={{ color: "var(--app-text-faint)" }}>{f.fields.length} fields → CRM customer{f.customerTag ? `, tag "${f.customerTag}"` : ""}</span></td>
                    <td className="py-2 pr-2"><StatusBadge status={f.status} /></td>
                    <td className="py-2 pr-2">{f.livePages?.length ? f.livePages.join(", ") : <span style={{ color: "var(--app-text-faint)" }}>Not on a live page</span>}</td>
                    <td className="py-2 pr-2">{f.last30Days?.accepted ?? 0} / {f.last30Days?.spamBlocked ?? 0} / {f.last30Days?.failed ?? 0}</td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Btn onClick={() => setEditing({ id: f.id, draft: { name: f.name, fields: f.fields, customerTag: f.customerTag, consentText: f.consentText ?? "", thankYouMessage: f.thankYouMessage ?? "", status: f.status } })}>Edit</Btn>
                        <Btn onClick={() => setTestFor(f)}><FlaskConical className="h-3.5 w-3.5" aria-hidden /> Test</Btn>
                        <Btn onClick={() => setLogFor(logFor === f.id ? null : f.id)}>Log</Btn>
                        <Btn aria-label="Duplicate form" onClick={() => void websiteApi.duplicateForm(f.id).then(() => qc.invalidateQueries({ queryKey: ["website"] })).catch((e: unknown) => setMessage({ tone: "danger", text: errorText(e) }))}><Copy className="h-3.5 w-3.5" aria-hidden /></Btn>
                        <Btn onClick={() => void websiteApi.updateForm(f.id, { status: f.status === "active" ? "disabled" : "active" }).then(() => qc.invalidateQueries({ queryKey: ["website"] })).catch((e: unknown) => setMessage({ tone: "danger", text: errorText(e) }))}>{f.status === "active" ? "Disable" : "Enable"}</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
          To embed a form, add a <strong>Form</strong> block to a page in <Link className="underline" href="/website/pages">Pages</Link> or <Link className="underline" href="/website/landing-pages">Landing Pages</Link>. A hidden spam trap blocks bots; blocked submissions never reach the CRM.
        </p>
      </Card>

      {editing && <FormEditor key={editing.id ?? "new"} value={editing.draft} isNew={!editing.id} onChange={(draft) => setEditing({ ...editing, draft })} onSave={() => save.mutate()} saving={save.isPending} onCancel={() => setEditing(null)} destinations={q.data} />}
      {testFor && <FormTester form={testFor} onClose={() => setTestFor(null)} />}
      {logFor && <SubmissionLog formId={logFor} />}
    </Page>
  );
}

function FormEditor({ value, isNew, onChange, onSave, saving, onCancel, destinations }: { value: Draft; isNew: boolean; onChange: (d: Draft) => void; onSave: () => void; saving: boolean; onCancel: () => void; destinations?: { destinations: { key: string; label: string }[]; unavailableDestinations: { key: string; label: string; reason: string }[] } }) {
  const setField = (i: number, patch: Partial<FormField>) => onChange({ ...value, fields: value.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <Card title={isNew ? "New form" : `Edit "${value.name}"`} actions={<><Btn variant="primary" onClick={onSave} disabled={saving}><Save className="h-3.5 w-3.5" aria-hidden /> Save form</Btn><Btn variant="ghost" onClick={onCancel}>Cancel</Btn></>}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Form name"><input className={inputClass} style={inputStyle} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></Field>
          <Field label="Destination" hint={destinations?.unavailableDestinations.map((d) => `${d.label}: not available. ${d.reason}`).join(" ")}>
            <select className={inputClass} style={inputStyle} value="crm_customer" disabled>
              {(destinations?.destinations ?? [{ key: "crm_customer", label: "CRM customer" }]).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Tag added to the customer"><input className={inputClass} style={inputStyle} value={value.customerTag ?? ""} onChange={(e) => onChange({ ...value, customerTag: e.target.value })} /></Field>
        </div>
        <div>
          <p className="m-0 mb-2 text-xs font-bold">Fields and CRM mapping</p>
          <p className="m-0 mb-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>The CRM needs a name and a phone number, so map one required field to each. Customers are matched by phone: an existing customer is updated, never duplicated.</p>
          <div className="flex flex-col gap-2">
            {value.fields.map((f, i) => (
              <div key={i} className="grid items-end gap-2 rounded-xl border p-2 md:grid-cols-[1.4fr_1fr_1.2fr_auto_auto]" style={{ borderColor: "var(--app-border)" }}>
                <Field label="Label"><input className={inputClass} style={inputStyle} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} /></Field>
                <Field label="Type"><select className={inputClass} style={inputStyle} value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormField["type"] })}>{FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Saves to"><select className={inputClass} style={inputStyle} value={f.mapTo} onChange={(e) => setField(i, { mapTo: e.target.value as FormField["mapTo"] })}>{(Object.keys(MAP_LABELS) as FormField["mapTo"][]).map((m) => <option key={m} value={m}>{MAP_LABELS[m]}</option>)}</select></Field>
                <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> Required</label>
                <Btn variant="ghost" aria-label="Remove field" onClick={() => onChange({ ...value, fields: value.fields.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Btn>
                {f.type === "select" && (
                  <div className="md:col-span-5"><Field label="Options (comma separated)"><input className={inputClass} style={inputStyle} value={f.options.join(", ")} onChange={(e) => setField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} /></Field></div>
                )}
              </div>
            ))}
            <Btn className="self-start" disabled={value.fields.length >= 25} onClick={() => onChange({ ...value, fields: [...value.fields, { key: "", label: "New field", type: "text", required: false, options: [], mapTo: "notes" }] })}><Plus className="h-3.5 w-3.5" aria-hidden /> Add field</Btn>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Marketing consent text (optional)" hint="If set, visitors see an unticked checkbox. Marketing consent is only recorded when they tick it.">
            <textarea className={inputClass} style={{ ...inputStyle, minHeight: 60 }} value={value.consentText ?? ""} onChange={(e) => onChange({ ...value, consentText: e.target.value })} />
          </Field>
          <Field label="Thank-you message"><textarea className={inputClass} style={{ ...inputStyle, minHeight: 60 }} value={value.thankYouMessage ?? ""} onChange={(e) => onChange({ ...value, thankYouMessage: e.target.value })} /></Field>
        </div>
      </div>
    </Card>
  );
}

function FormTester({ form, onClose }: { form: WebsiteForm; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [consent, setConsent] = useState(false);
  const test = useMutation({ mutationFn: () => websiteApi.testForm(form.id, values, consent) });
  return (
    <Card title={`Test "${form.name}"`} actions={<><Btn variant="primary" onClick={() => test.mutate()}><FlaskConical className="h-3.5 w-3.5" aria-hidden /> Run test</Btn><Btn variant="ghost" onClick={onClose}>Close</Btn></>}>
      <Notice>Test submissions are logged as tests and never write to the CRM. The result shows exactly what a real submission would do.</Notice>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {form.fields.map((f) => (
          <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
            {f.type === "checkbox" ? <input type="checkbox" checked={values[f.key] === true} onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })} /> : f.type === "select" ? (
              <select className={inputClass} style={inputStyle} value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}><option value="">Choose…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
            ) : <input className={inputClass} style={inputStyle} value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />}
          </Field>
        ))}
        {form.consentText && <label className="flex items-center gap-2 text-xs md:col-span-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {form.consentText}</label>}
      </div>
      {test.isError && <div className="mt-3"><Notice tone="danger">{errorText(test.error)}</Notice></div>}
      {test.data && (
        <div className="mt-3">
          {test.data.valid && test.data.wouldWrite ? (
            <Notice tone="ok">
              Would {test.data.wouldWrite.action === "create_customer" ? "create a new customer" : `update existing customer "${test.data.wouldWrite.existingCustomer?.name}"`}: {test.data.wouldWrite.name}, {test.data.wouldWrite.phone}
              {test.data.wouldWrite.email ? `, ${test.data.wouldWrite.email}` : ""}; tag &ldquo;{test.data.wouldWrite.tag}&rdquo;; marketing consent {test.data.wouldWrite.marketingConsent ? "granted" : "not granted"}.
              {test.data.wouldWrite.notes.length ? ` Notes: ${test.data.wouldWrite.notes.join("; ")}` : ""}
            </Notice>
          ) : (
            <Notice tone="danger">Would be rejected: {test.data.errors.join(" ")}</Notice>
          )}
        </div>
      )}
    </Card>
  );
}

function SubmissionLog({ formId }: { formId: string }) {
  const q = useQuery({ queryKey: ["website", "form-log", formId], queryFn: () => websiteApi.formSubmissions(formId) });
  return (
    <Card title="Submission log (metadata only)">
      {q.isLoading ? <p className="m-0 text-sm">Loading…</p> : (q.data ?? []).length === 0 ? <Empty>No submissions yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead style={{ color: "var(--app-text-faint)" }}><tr><th className="py-2 pr-2">When</th><th className="py-2 pr-2">Outcome</th><th className="py-2 pr-2">CRM customer</th><th className="py-2 pr-2">Consent</th><th className="py-2 pr-2">UTM</th></tr></thead>
            <tbody>
              {q.data!.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                  <td className="py-2 pr-2">{formatDate(s.createdAt)}</td>
                  <td className="py-2 pr-2"><StatusBadge status={s.status === "accepted" ? "verified" : s.status === "spam_blocked" ? "pending" : "failed"} label={s.isTest ? `Test · ${s.status}` : s.status.replace("_", " ")} />{s.errorReason ? <span className="ml-1">{s.errorReason}</span> : null}</td>
                  <td className="py-2 pr-2">{s.customerId ? <Link className="underline" href={`/customers/${s.customerId}`}>{s.customerName ?? "Open"}</Link> : "—"}{s.createdCustomer ? " (new)" : ""}</td>
                  <td className="py-2 pr-2">{s.marketingConsent ? "Granted" : "No"}</td>
                  <td className="py-2 pr-2">{Object.entries(s.utm ?? {}).map(([k, v]) => `${k.replace("utm_", "")}=${v}`).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
