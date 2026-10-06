"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { ctApi, type CtDrawer, type CtOptions } from "@/lib/contracts-api";
import type { RenderHandlers } from "@/components/payments/pay-render";
import { getPath, setPath, type AField, type AModal, type AValues } from "@/components/assets/am-store";
import { ctScopeOf, useCt } from "./ct-store";

export const CT_PATH: Record<string, string> = {
  overview: "",
  documents: "/documents",
  templates: "/templates",
  contracts: "/all",
  detail: "/",
  signatures: "/signatures",
  approvals: "/approvals",
  expiries: "/expiries",
  compliance: "/compliance",
  settings: "/settings",
};
export const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

const F = (name: string, label: string, type: AField["type"] = "text", o: Partial<AField> = {}): AField => ({ name, label, type, ...o });
const O = (a: (string | [string, string])[]) => a.map((x) => (typeof x === "string" ? { v: x, t: x } : { v: x[0], t: x[1] }));
const sv = (v: AValues, k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const DOC_TYPES = ["Supplier Agreement", "Customer Agreement", "Service Agreement", "Employment Document", "Lease", "Policy", "License", "Certificate", "Insurance Proof", "Proposal", "Registration", "NDA", "Other"];
const CT_TYPES = ["Customer Agreement", "Service Agreement", "Supplier Agreement", "Vendor Contract", "NDA", "Employment Contract", "Partnership", "Lease", "Maintenance Agreement", "Subscription Agreement", "License", "Custom"];
const TPL_TYPES = ["Contract", "Proposal", "Agreement", "NDA", "Service Agreement", "Employment Document", "Supplier Agreement", "Customer Agreement", "Policy", "Consent", "Form", "Certificate", "Custom"];
const CMP_TYPES = ["Policy", "License", "Certificate", "Insurance Proof", "Tax Evidence", "Registration", "Employee Policy", "Supplier Certificate", "Safety Document", "Data/Privacy Evidence", "Custom"];
const RETENTIONS = ["7 years after expiry", "3 years", "10 years", "Permanent"];
const POLICIES = ["None", "Owner", "Contract Manager → Finance → Owner", "HR → Owner", "Legal/Compliance → Owner"];
const SIG_ROLES = ["Business Signatory", "Customer", "Supplier", "Employee", "Witness", "Landlord", "Counterparty", "Custom"];
const step = (L: string[], i: number) => `${L[i]} · step ${i + 1} of ${L.length}`;

type CtRef = {
  id: string;
  number: string;
  title: string;
  type: string;
  status: string;
  version: number;
  ownerId: string;
  start: string;
  end: string | null;
  notice: number;
  noticeBy: string | null;
  noticePassed: boolean;
  autoRenew: boolean;
  value: number | null;
  valueLabel: string;
  cp: string;
  cpName: string;
  docId: string | null;
  signer: { name?: string; email?: string; order?: string; auth?: string } | null;
  related: { module: string; ref: string; id: string }[];
  terms: { id: string; term: string; value: string; source: string }[];
  obls: { id: string; title: string; ownerId: string; due: string; status: string }[];
  amends: { id: string; number: string; status: string; docId: string | null }[];
  openApproval: string | null;
  completedSig: string | null;
  acts: string[];
};
type Wiz = Record<string, string | boolean | null | undefined | { name: string; email: string; role: string }[] | string[]> & { file?: never };

/** Where a related record lives in Noxtill (opened in its own module). */
const moduleHref = (module: string, id: string) => {
  const [kind, rid] = id.includes(":") ? id.split(":") : ["", id];
  if (module === "Customers CRM" || kind === "customer") return `/customers/${rid}`;
  if (module === "Projects & Tasks") return `/projects/${rid}`;
  if (module === "Assets & Maintenance") return `/assets-maintenance/assets/${rid}`;
  if (module === "Field Service") return "/field-service/service-agreements";
  if (module === "Orders") return "/orders";
  if (module === "Finance & Accounting") return "/finance";
  if (module === "Suppliers" || kind === "supplier") return "/inventory";
  if (module === "People & Payroll" || kind === "staff") return "/staff";
  if (module === "Branches") return "/branches";
  return null;
};

export function useCtActions(opt: CtOptions | undefined) {
  const router = useRouter();
  const qc = useQueryClient();
  return useMemo(() => {
    const st = useCt;
    const R = opt?.rights;
    const flash = (t: string) => st.getState().flash(t);
    const modal = (m: AModal) => st.getState().openModal(m);
    const refresh = () => qc.invalidateQueries({ queryKey: ["ct"] });
    const after = async (msg: string) => {
      await refresh();
      flash(msg);
    };
    const run = async (fn: () => Promise<string>) => {
      try {
        await after(await fn());
      } catch (e) {
        flash(errText(e));
      }
    };
    const open = (kind: string, id: string) => st.getState().set({ drawer: { kind, id } });
    const scope = () => ctScopeOf(st.getState());
    const ref = async <T,>(kind: string, id: string) => (await ctApi.drawer(kind, id, scope())).ref as T;
    const go = (tab: string, id?: string, filt?: Record<string, string>, fk?: string) => {
      const s = st.getState();
      st.getState().set({ drawer: null, sel: [], page: {}, ...(id ? { cur: id, view: { ...s.view, dTab: "ov" } } : {}), ...(filt && fk ? { f: { ...s.f, [fk]: filt } } : {}) });
      router.push(`/contracts${tab === "detail" ? `/${id ?? s.cur}` : CT_PATH[tab]}`);
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    };
    const reason = (title: string, label: string, primaryT: string, fn: (r: string) => Promise<string>, o: { danger?: boolean; sub?: string; req?: boolean; note?: string } = {}) =>
      modal({ title, sub: o.sub, note: o.note, primaryT, pBg: o.danger ? "#B42318" : "#12A150", fields: [F("reason", label, "text", { req: o.req !== false, af: true })], onSubmit: async (v) => void (await after(await fn(sv(v, "reason")))) });
    const confirm = (title: string, sub: string, primaryT: string, fn: () => Promise<string>, danger = false) => modal({ title, sub, primaryT, pBg: danger ? "#B42318" : "#12A150", fields: [], onSubmit: async () => void (await after(await fn())) });
    const name = (id?: string | null) => opt?.members.find((m) => m.v === id)?.t ?? "—";
    const memberOpts = () => (opt?.members ?? []).map((m) => ({ v: m.v, t: m.t }));
    const partyOpts = () => (opt?.parties ?? []).map((p) => ({ v: p.v, t: p.t }));
    const openUrl = (url: string) => window.open(url, "_blank", "noopener");
    const dl = (fn: () => Promise<{ url: string; name: string | null }>) =>
      fn()
        .then((r) => {
          openUrl(r.url);
          flash(`Download started via a 5-minute signed link${r.name ? ` (${r.name})` : ""}.`);
        })
        .catch((e) => flash(errText(e)));

    // ── documents ─────────────────────────────────────────────────────────
    const uploadModal = (d: { title?: string; folder?: string; linkModule?: string; linkId?: string; data?: Record<string, unknown>; files?: File[] } = {}) => {
      const cfg = opt?.cfg;
      const prev = (d.data ?? {}) as Record<string, string>;
      modal({
        title: "Upload document",
        sub: "Files go to private storage, are hashed (SHA-256) and checked for duplicates. No malware scanner is connected — files are checked for type and size only.",
        primaryT: "Upload",
        wide: true,
        fields: [
          F("files", "File", "file", { accept: (cfg?.types ?? []).map((t) => `.${t.toLowerCase()}${t === "JPG" ? ",.jpeg" : ""}`).join(","), help: `Allowed: ${(cfg?.types ?? []).join(", ")} · max ${cfg?.maxMb ?? 25} MB · one file per upload here (each file becomes its own document)` }),
          F("title", "Title", "text", { req: true, af: true, value: prev.title ?? d.title ?? "" }),
          F("type", "Document type", "select", { value: prev.type ?? "Other", options: O(DOC_TYPES) }),
          F("description", "Description", "area", { rows: 2, value: prev.description ?? "" }),
          F("folder", "Folder", "select", { value: prev.folder ?? d.folder ?? opt?.folders[0] ?? "", options: O(opt?.folders ?? []) }),
          F("ownerId", "Owner", "select", { value: prev.ownerId ?? "", options: [{ v: "", t: "Me" }, ...memberOpts()] }),
          F("branchId", "Branch", "select", { value: prev.branchId ?? "", options: [{ v: "", t: "Not branch-specific" }, ...(opt?.branches ?? [])] }),
          F("link", "Linked record", "select", { value: prev.link ?? (d.linkModule ? `${d.linkModule}|${d.linkId}` : ""), options: [{ v: "", t: "None" }, ...(opt?.links ?? []).map((l) => ({ v: `${l.module}|${l.id}`, t: `${l.label} · ${l.module}` }))] }),
          F("tags", "Tags (comma separated)", "text", { value: prev.tags ?? "" }),
          F("sensitivity", "Sensitivity", "select", { value: prev.sensitivity ?? "Internal", options: O(["Public", "Internal", "Confidential", ...(R?.restricted ? ["Restricted"] : [])]) }),
          F("expiresOn", "Expiry date", "date", { value: prev.expiresOn ?? "" }),
          F("retention", "Retention", "select", { value: prev.retention ?? RETENTIONS[0], options: O(RETENTIONS) }),
          F("approval", "Requires approval", "select", { value: prev.approval ?? "", options: O([["", "No"], ["1", "Yes — Legal/Compliance approves before it’s Active"]]) }),
        ],
        onSubmit: async (v) => {
          const file = v.files as File | null;
          const [linkModule, ...rest] = sv(v, "link").split("|");
          const data = { title: sv(v, "title"), type: sv(v, "type"), description: sv(v, "description"), folder: sv(v, "folder"), ownerId: sv(v, "ownerId") || undefined, branchId: sv(v, "branchId") || null, linkModule: linkModule || null, linkId: rest.join("|") || null, tags: sv(v, "tags"), sensitivity: sv(v, "sensitivity"), expiresOn: sv(v, "expiresOn") || null, retention: sv(v, "retention"), approval: sv(v, "approval") === "1" };
          if (file && opt && file.size > opt.cfg.maxMb * 1048576) return `FILE_TOO_LARGE — ${file.name} is over ${opt.cfg.maxMb} MB.`;
          const hit = (await ctApi.duplicate(data.title, data.type)).hit;
          const create = async () => {
            const r = await ctApi.uploadDocs(data, file ? [file] : []);
            await after(`${r.map((x) => `${x.number} (${x.status})`).join(", ")} uploaded.${data.approval ? " Approval requested." : ""}`);
          };
          if (!hit) return void (await create());
          modal({
            title: "Possible duplicate found",
            sub: `“${data.title}” looks like ${hit.number} · ${hit.title}${hit.sameFile ? " (same file contents)" : " (same type, similar name)"}.`,
            primaryT: "Continue",
            fields: [F("how", "What should happen?", "select", { options: O([["open", "Open the existing document"], ["ver", `Upload as a new version of ${hit.number}`], ["sep", "Continue as a separate document"]]) })],
            onSubmit: async (w) => {
              const h = sv(w, "how");
              if (h === "open") return void open("doc", hit.id);
              if (h === "ver") {
                if (!file) return "Choose a file first — a version needs a file.";
                const r = await ctApi.newVersion(hit.id, `New version: ${data.title}`, file);
                return void (await after(`${hit.number} v${r.version} uploaded — previous versions kept.`));
              }
              await create();
            },
          });
          return "keep";
        },
      });
    };
    const newVersion = (id: string, title: string, version: number, immutable: boolean, hold: string | null) =>
      modal({
        title: `Upload new version · ${title}`,
        sub: `Current v${version}${immutable ? " is locked — this creates" : " is an editable draft — this still creates"} v${version + 1} and keeps history.`,
        note: hold ? `Legal hold: ${hold} — new versions are blocked.` : null,
        primaryT: `Upload v${version + 1}`,
        fields: [F("file", "File", "file", { req: true }), F("note", "Change note", "text", { req: true, af: true })],
        onSubmit: async (v) => void (await after(`v${(await ctApi.newVersion(id, sv(v, "note"), v.file as File)).version} uploaded.`)),
      });
    const moveTag = (kind: "move" | "tag", ids: string[]) =>
      modal({
        title: `${kind === "move" ? "Move" : "Tag"} ${ids.length} document(s)`,
        primaryT: kind === "move" ? "Move" : "Add tags",
        fields: kind === "move" ? [F("folder", "Folder", "select", { options: O(opt?.folders ?? []) })] : [F("tags", "Tags (comma separated)", "text", { req: true, af: true })],
        onSubmit: async (v) => {
          await (kind === "move" ? ctApi.move(ids, sv(v, "folder")) : ctApi.tag(ids, sv(v, "tags")));
          st.getState().set({ sel: [] });
          await after(kind === "move" ? `Moved to ${sv(v, "folder")}.` : "Tags added.");
        },
      });
    const shareModal = (id: string, title: string, shares: string[], sens: string) =>
      modal({
        title: `Share internally · ${title}`,
        sub: "Internal only — people get an in-app notification. Nothing is sent outside Noxtill.",
        note: sens === "Restricted" ? "Restricted documents can only be shared with people who hold contracts.restricted." : null,
        primaryT: "Share",
        fields: [F("who", "Share with", "checks", { options: memberOpts().map((o) => ({ ...o, on: shares.includes(o.v) })) }), F("perm", "Permission", "select", { options: O(["View", "View + download"]) })],
        onSubmit: async (v) => void (await after(`Shared with ${(await ctApi.share(id, (v.who as string[]) ?? [], sv(v, "perm"))).n as number} person(s).`)),
      });
    const docAction = async (id: string, v: string, dv?: CtDrawer) => {
      const r = (dv?.ref ?? (v === "Open" || v === "Download" || v === "Compare versions" ? null : await ref("doc", id))) as { title: string; version: number; immutable: boolean; hold: string | null; sensitivity: string; shares: string[]; ret: string } | null;
      if (v === "Open") return open("doc", id);
      if (v === "Download") return dl(() => ctApi.downloadDoc(id));
      if (v === "Compare versions") return open("cmpv", id);
      if (!r) return;
      if (v === "Upload new version") return newVersion(id, r.title, r.version, r.immutable, r.hold);
      if (v === "Move" || v === "Tag") return moveTag(v === "Move" ? "move" : "tag", [id]);
      if (v === "Share internally") return shareModal(id, r.title, r.shares ?? [], r.sensitivity);
      if (v === "Archive") return reason(`Archive ${r.title}?`, "Reason", "Archive", async (x) => (await ctApi.archiveDoc(id, x), "Archived — retained and searchable by permitted people."), { sub: `Archived documents stay retained (${r.ret}).` });
      if (v === "Restore") return run(async () => (await ctApi.restoreDoc(id), "Restored."));
      if (v === "Delete") return reason(`Delete ${r.title}?`, "Reason", "Delete", async (x) => (await ctApi.deleteDoc(id, x), "Deleted — recorded in the audit log."), { danger: true, sub: "Retention, legal hold and dependency checks run on the server first." });
      if (v === "Place legal hold") return reason(`Legal hold · ${r.title}`, "Reason for the hold", "Place hold", async (x) => (await ctApi.hold(id, x), "Legal hold placed — delete, archive, move and new versions are blocked."));
      if (v === "Release legal hold") return confirm(`Release legal hold on ${r.title}?`, r.hold ?? "", "Release", async () => (await ctApi.hold(id, null), "Legal hold released."));
    };

    // ── templates ─────────────────────────────────────────────────────────
    const tplModal = (t?: { id: string; name: string; type: string; content: string; roles: string[]; approval: string; status: string; version: number }) =>
      modal({
        title: t ? `Edit ${t.name}${t.status !== "Draft" ? ` → new draft v${t.version + 1}` : ""}` : "New template",
        sub: t && t.status !== "Draft" ? `Published v${t.version} stays immutable.` : "Use typed {{variables}} — open the variable browser for the list.",
        primaryT: "Save draft",
        wide: true,
        fields: [
          F("name", "Template name", "text", { req: true, af: true, value: t?.name ?? "" }),
          F("type", "Type", "select", { value: t?.type ?? "Contract", options: O(TPL_TYPES) }),
          F("content", "Content (use {{variables}})", "area", { rows: 9, req: true, value: t?.content ?? "This agreement is made between {{business.name}} and {{counterparty.name}}, starting {{contract.start_date}}.\n\n1. Scope …\n2. Payment terms: {{payment.terms}}\n3. Term & termination: notice of {{contract.notice_days}} days." }),
          F("roles", "Signer roles", "checks", { options: O([...SIG_ROLES.filter((x) => x !== "Custom"), "Approver"]).map((o) => ({ ...o, on: t ? t.roles.includes(o.v) : ["Business Signatory", "Customer"].includes(o.v) })) }),
          F("approval", "Approval policy", "select", { value: t?.approval ?? "None", options: O(POLICIES) }),
        ],
        onSubmit: async (v) => {
          const r = await ctApi.saveTemplate(t?.id ?? null, { name: sv(v, "name"), type: sv(v, "type"), content: sv(v, "content"), roles: (v.roles as string[]) ?? [], approval: sv(v, "approval") });
          await after(`${r.number} v${r.version} saved as a draft.`);
        },
      });
    const tplAction = async (id: string, v: string) => {
      if (v === "Preview") return open("tplprev", id);
      if (v === "Version history") return open("tplhist", id);
      const t = await ref<{ id: string; number: string; name: string; type: string; content: string; roles: string[]; approval: string; status: string; version: number; publishedVersion: number | null }>("tplprev", id);
      if (v === "Edit") return tplModal(t);
      if (v === "Duplicate") return run(async () => `${(await ctApi.dupTemplate(id)).number} created as a draft copy.`);
      if (v === "Publish version")
        return confirm(`Publish ${t.name} v${t.version}?`, t.approval !== "None" ? `Approval policy: ${t.approval}. This starts the approval route; once approved the version is immutable.` : `Published versions are immutable. Later edits create v${t.version + 1}.`, t.approval !== "None" ? "Request approval" : "Publish", async () => {
          const r = await ctApi.publish(id);
          return r.approval ? `${r.approval} started — publishes when approved.` : `${t.number} v${t.version} published.`;
        });
      if (v === "Archive") return confirm(`Archive ${t.name}?`, "Contracts already generated from it are unaffected.", "Archive", async () => (await ctApi.archiveTemplate(id), "Template archived."), true);
      if (v === "Generate contract") return ctWizard(1, { src: "tpl", templateId: id, type: CT_TYPES.includes(t.type) ? t.type : "Custom" });
    };

    // ── contract wizard (9 steps) ─────────────────────────────────────────
    const WZ = ["Source", "Identity", "Parties", "Dates", "Commercial refs", "Terms / document", "Approvals", "Signature", "Review"];
    const ctWizard = (s: number, d: Wiz, file: File | null = null): void => {
      const back = s > 0 ? () => ctWizard(s - 1, d, file) : undefined;
      const tpls = opt?.templates ?? [];
      const base = { title: d.src === "upload" ? "Import signed contract" : "New contract", sub: step(WZ, s), back, cancel: s > 0 ? "Back" : "Cancel", wide: true, primaryT: s === 8 ? (d.src === "upload" ? "Import as Active" : "Create draft") : "Next" };
      const next = (patch: Wiz, f: File | null = file) => ctWizard(s + 1, { ...d, ...patch }, f);
      if (s === 0)
        return modal({
          ...base,
          fields: [
            F("src", "Start from", "select", { value: String(d.src ?? "tpl"), options: O([["tpl", "Template"], ["blank", "Blank contract"], ["upload", "Upload existing signed contract"]]) }),
            F("templateId", "Template (published)", "select", { value: String(d.templateId ?? tpls[0]?.v ?? ""), options: tpls.length ? tpls : [{ v: "", t: "No published templates yet" }] }),
          ],
          onSubmit: async (v) => {
            if (sv(v, "src") === "tpl" && !sv(v, "templateId")) return "Publish a template first, or start blank.";
            next({ src: sv(v, "src"), templateId: sv(v, "src") === "tpl" ? sv(v, "templateId") : null, type: d.type ?? tpls.find((t) => t.v === sv(v, "templateId"))?.type ?? null, body: null });
            return "keep";
          },
        });
      if (s === 1)
        return modal({
          ...base,
          fields: [F("title", "Title", "text", { req: true, af: true, value: String(d.title ?? "") }), F("type", "Contract type", "select", { value: String(CT_TYPES.includes(String(d.type)) ? d.type : "Service Agreement"), options: O(CT_TYPES) }), F("num", "Contract number", "read", { value: `Assigned by the server on create (next: ${opt?.nextNumber ?? "—"})` })],
          onSubmit: async (v) => (next({ title: sv(v, "title"), type: sv(v, "type") }), "keep"),
        });
      if (s === 2)
        return modal({
          ...base,
          fields: [F("entity", "Internal entity", "read", { value: "Your business (Settings › Business profile)" }), F("cp", "Counterparty (canonical record)", "select", { req: true, value: String(d.cp ?? ""), options: [{ v: "", t: "Choose from CRM / Suppliers / Staff…" }, ...partyOpts()] }), F("branchId", "Branch", "select", { value: String(d.branchId ?? ""), options: [{ v: "", t: "From the counterparty / not branch-specific" }, ...(opt?.branches ?? [])] })],
          onSubmit: async (v) => (next({ cp: sv(v, "cp"), branchId: sv(v, "branchId") || null }), "keep"),
        });
      if (s === 3)
        return modal({
          ...base,
          fields: [F("start", "Start date", "date", { req: true, value: String(d.start ?? iso(7)) }), F("end", "End date", "date", { value: String(d.end ?? iso(372)), help: "Leave empty for an open-ended contract." }), F("notice", "Notice period (days)", "number", { value: String(d.notice ?? 30) }), F("autoRenew", "Auto-renew", "select", { value: d.autoRenew ? "1" : "", options: O([["", "No"], ["1", "Yes"]]) })],
          onSubmit: async (v) => {
            const start = sv(v, "start");
            const end = sv(v, "end");
            if (end && end <= start) return "End date must be after the start date.";
            if (end && d.src !== "upload" && plusDays(end, -Number(sv(v, "notice") || 0)) < iso(0)) return "Notice deadline would already be in the past.";
            next({ start, end: end || null, notice: sv(v, "notice"), autoRenew: sv(v, "autoRenew") === "1" });
            return "keep";
          },
        });
      if (s === 4)
        return modal({
          ...base,
          fields: [F("value", `Referenced value (${opt?.currency ?? ""})`, "number", { value: String(d.value ?? ""), help: "Reference only — no accounting entry is created." }), F("refs", "Canonical references (order / project / service agreement / asset)", "text", { value: String(d.refs ?? ""), ph: "e.g. ORD-5231, PRJ-0012, AGR-003", help: "Each reference must match a real record — unknown numbers are refused." })],
          onSubmit: async (v) => (next({ value: sv(v, "value"), refs: sv(v, "refs") }), "keep"),
        });
      if (s === 5) {
        if (d.src === "upload")
          return modal({
            ...base,
            fields: [F("file", "Signed contract file", "file", { req: !file, help: file ? `Selected: ${file.name}` : undefined })],
            note: "An imported signed copy is recorded as Active (signed outside Noxtill) — it doesn’t go through approval or eSign.",
            onSubmit: async (v) => (next({}, (v.file as File | null) ?? file), "keep"),
          });
        void ctApi
          .preview({ ...d, body: d.body ?? undefined })
          .then((p) =>
            modal({
              ...base,
              fields: [F("body", "Contract wording (variables already filled from records)", "area", { rows: 12, value: String(d.body ?? p.text), req: true })],
              note: p.open.length ? `Still open — type these into the wording (no Noxtill record holds them): ${p.open.map((x) => `{{${x}}}`).join(", ")}. {{contract.number}} is filled on create.` : "Every variable is filled from a real record. {{contract.number}} is filled on create.",
              onSubmit: async (v) => (next({ body: sv(v, "body") }), "keep"),
            }),
          )
          .catch((e) => flash(errText(e)));
        return;
      }
      if (s === 6) {
        const hi = Number(d.value || 0) > (opt?.cfg.threshold ?? Infinity);
        return modal({
          ...base,
          fields: [F("apr", "Approval route (runs when you submit the draft)", "read", { value: d.src === "upload" ? "None — imported signed contracts are recorded as Active." : ["Contract Owner (you — recorded as approved on submit)", ...(hi ? [`Finance (value above ${opt?.cfg.threshold.toLocaleString()} ${opt?.currency})`] : []), ...(d.type === "Employment Contract" ? ["HR"] : []), "Authorized Signatory"].join(" → ") })],
          onSubmit: async () => (next({}), "keep"),
        });
      }
      if (s === 7) {
        if (d.src === "upload") return next({});
        return modal({
          ...base,
          fields: [F("signer", "Counterparty signer name", "text", { value: String(d.signer ?? "") }), F("email", "Signer email", "text", { value: String(d.email ?? opt?.parties.find((p) => p.v === d.cp)?.email ?? "") }), F("order", "Signing order", "select", { value: String(d.order ?? opt?.cfg.order ?? "Sequential"), options: O(["Sequential", "Parallel"]) }), F("auth", "Authentication", "select", { value: String(d.auth ?? ""), options: O(opt?.cfg.authMethods ?? ["Email"]) })],
          onSubmit: async (v) => {
            if (sv(v, "email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sv(v, "email"))) return "Signer email looks invalid.";
            next({ signer: sv(v, "signer"), email: sv(v, "email"), order: sv(v, "order"), auth: sv(v, "auth") });
            return "keep";
          },
        });
      }
      const cp = opt?.parties.find((p) => p.v === d.cp);
      return modal({
        ...base,
        fields: [
          F("sum", "Review", "read", {
            value: [
              `${String(d.title)} · ${String(d.type)}`,
              `Counterparty: ${cp?.t ?? "—"}`,
              `Dates: ${String(d.start)} → ${d.end ? String(d.end) : "open-ended"} · notice ${String(d.notice ?? 0)}d${d.autoRenew ? " · auto-renew" : ""}`,
              `Referenced value: ${d.value ? `${Number(d.value).toLocaleString()} ${opt?.currency}` : "—"}`,
              `Source: ${d.src === "tpl" ? `template ${tpls.find((t) => t.v === d.templateId)?.t ?? ""}` : d.src === "upload" ? `uploaded file ${file?.name ?? ""}` : "blank"}`,
              d.src === "upload" ? "Recorded as Active — signed outside Noxtill." : `Signer: ${d.signer ? `${String(d.signer)} <${String(d.email)}>` : "add later"}`,
              d.src === "upload" ? "" : "Creates a Draft — nothing is sent for approval or signature yet.",
            ]
              .filter(Boolean)
              .join("\n"),
          }),
        ],
        onSubmit: async () => {
          const r = await ctApi.create({ ...d, notice: Number(d.notice || 0), value: d.value === "" ? null : d.value }, file);
          await after(`${r.number} created as ${r.status} (document ${r.docNumber}).`);
          go("detail", r.number);
        },
      });
    };

    // ── contract actions ──────────────────────────────────────────────────
    const ctRef = (id: string) => ref<CtRef>("ct", id);
    const editModal = (c: CtRef, mine?: Record<string, string>) =>
      modal({
        title: `Edit draft · ${c.number} (v${c.version})`,
        sub: "Dates and values change the register. The generated document text isn’t rewritten — upload a new version if the wording changes.",
        primaryT: "Save",
        fields: [
          F("title", "Title", "text", { req: true, value: mine?.title ?? c.title }),
          F("end", "End date", "date", { value: mine?.end ?? c.end ?? "" }),
          F("notice", "Notice (days)", "number", { value: mine?.notice ?? String(c.notice) }),
          F("value", `Referenced value (${opt?.currency})`, "number", { value: mine?.value ?? (c.value == null ? "" : String(c.value)) }),
          F("ownerId", "Owner", "select", { value: mine?.ownerId ?? c.ownerId, options: memberOpts() }),
        ],
        onSubmit: async (v) => {
          const b = { title: sv(v, "title"), end: sv(v, "end") || null, notice: sv(v, "notice"), value: sv(v, "value") || null, ownerId: sv(v, "ownerId") };
          try {
            const r = await ctApi.edit(c.id, { ...b, expectedVersion: c.version });
            await after(`Saved as v${r.version}. ${r.note}`);
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 409) throw e;
            const latest = await ctRef(c.id);
            modal({
              title: "This contract changed while you were editing.",
              sub: errText(e),
              primaryT: "Apply",
              fields: [
                F("how", "Choose", "select", { options: O([["reload", "Reload latest (discard my edits)"], ["reapply", "Review, then re-apply mine on the latest version"]]) }),
                F("cmp", "Compare", "read", { value: `Theirs (v${latest.version}): ${latest.title} · end ${latest.end ?? "open"} · notice ${latest.notice}d · value ${latest.valueLabel}\nYours: ${b.title} · end ${b.end ?? "open"} · notice ${b.notice}d · value ${b.value ?? "—"}` }),
              ],
              onSubmit: async (w) => {
                if (sv(w, "how") === "reapply") return void editModal(latest, { title: b.title, end: b.end ?? "", notice: String(b.notice), value: String(b.value ?? ""), ownerId: b.ownerId });
                await after("Reloaded the latest version. Your edits were discarded.");
              },
            });
            return "keep";
          }
        },
      });
    const submitModal = (c: CtRef) => {
      const hi = (c.value ?? 0) > (opt?.cfg.threshold ?? Infinity);
      modal({
        title: `Submit ${c.number} for approval`,
        sub: "Approvals run step by step inside Contracts; approvers come from Settings › Approvals.",
        primaryT: "Submit",
        note: opt?.cfg.fourEyes ? "Four-eyes: you can’t approve steps on your own request." : null,
        fields: [F("steps", "Approval steps", "read", { value: [`Contract Owner — ${name(c.ownerId)}`, ...(hi ? [`Finance (value above ${opt?.cfg.threshold.toLocaleString()})`] : []), ...(c.type === "Employment Contract" ? ["HR"] : []), "Authorized Signatory"].join("\n") }), F("note", "Note for approvers", "area", { rows: 2 })],
        onSubmit: async (v) => {
          const r = await ctApi.submit(c.id, sv(v, "note"));
          await after(r.status === "Approved" ? `${r.approval}: every step already satisfied — ${c.number} is Approved.` : `${r.approval} started (${r.steps} steps). ${c.number} is Approval Required.`);
        },
      });
    };
    const renewModal = (c: CtRef) =>
      modal({
        title: `Renew ${c.number}`,
        sub: "Creates a renewal draft as a NEW contract. The current signed contract and its end date are preserved.",
        note: c.noticePassed ? `Notice deadline ${c.noticeBy} has passed.` : null,
        primaryT: "Create renewal draft",
        fields: [F("end", "New end date", "date", { req: true, value: c.end ? plusDays(c.end, 365) : iso(365) }), F("changes", "Changes vs current terms", "area", { rows: 2 })],
        onSubmit: async (v) => {
          const r = await ctApi.renew(c.id, sv(v, "end"), sv(v, "changes"));
          await after(`Renewal draft ${r.number} created. ${c.number} is unchanged.`);
          go("detail", r.number);
        },
      });
    const wnrModal = (c: CtRef) =>
      modal({
        title: `Mark will not renew · ${c.number}`,
        primaryT: "Confirm",
        pBg: "#B42318",
        fields: [F("reason", "Reason", "text", { req: true, af: true }), F("notify", "Notify counterparty", "select", { options: O([["", "No — record the decision only"], ["1", `Yes — email ${c.cpName} a non-renewal notice`]]) })],
        onSubmit: async (v) => void (await after((await ctApi.wnr(c.id, sv(v, "reason"), sv(v, "notify") === "1")).sent ? "Recorded — non-renewal notice emailed." : "Recorded: will not renew.")),
      });
    const terminateModal = (c: CtRef) =>
      modal({
        title: `Terminate ${c.number}`,
        sub: `${c.title} · currently ${c.status}`,
        primaryT: "Terminate contract",
        pBg: "#B42318",
        fields: [
          F("eff", "Termination effective date", "date", { req: true, value: iso(c.notice) }),
          F("reason", "Reason", "text", { req: true, af: true }),
          F("info", "Impact", "read", { value: `Notice required: ${c.notice} days (earliest ${iso(c.notice)})\nOpen obligations cancelled: ${c.obls.filter((o) => !["Completed", "Waived", "Cancelled"].includes(o.status)).map((o) => o.title).join(", ") || "none"}\nLinked records: ${c.related.map((r) => `${r.module} ${r.ref}`).join(", ") || "none"}` }),
          F("typed", "Type TERMINATE to confirm", "text", { req: true }),
        ],
        onSubmit: async (v) => void (await after((await ctApi.terminate(c.id, { eff: sv(v, "eff"), reason: sv(v, "reason"), typed: sv(v, "typed") }), `${c.number} terminated.`))),
      });
    const amendModal = (c: CtRef) =>
      modal({
        title: `Create amendment · ${c.number}`,
        sub: "The signed original stays unchanged. The amendment gets its own document and goes through approval and signature.",
        primaryT: "Create amendment draft",
        fields: [F("reason", "Reason / change", "area", { req: true, af: true, rows: 3 }), F("eff", "Effective date", "date", { value: iso(14) }), F("sections", "Changed sections", "text", { ph: "e.g. Clause 7.3, Schedule B" })],
        onSubmit: async (v) => {
          const r = await ctApi.amend(c.id, { reason: sv(v, "reason"), eff: sv(v, "eff"), sections: sv(v, "sections") });
          await after(`${r.number} drafted (document ${r.docNumber}). Submit it for approval from the Amendments tab.`);
        },
      });
    const ctAction = async (id: string, v: string) => {
      if (v === "Open") return go("detail", id);
      if (v === "Audit") {
        go("detail", id);
        return st.getState().set((s) => ({ view: { ...s.view, dTab: "audit" } }));
      }
      const c = await ctRef(id);
      if (v === "Edit draft") return editModal(c);
      if (v === "Submit for approval") return submitModal(c);
      if (v === "Send for signature") return sigWizard(0, { docId: c.docId ?? "" });
      if (v === "Duplicate") return ctWizard(1, { src: "blank", title: `${c.title} (copy)`, type: c.type, cp: c.cp, notice: String(c.notice), autoRenew: c.autoRenew, value: c.value == null ? "" : String(c.value) });
      if (v === "Compare versions") return c.docId ? open("cmpv", c.docId) : flash("No document linked.");
      if (v === "Renew") return renewModal(c);
      if (v === "Create amendment") return amendModal(c);
      if (v === "Terminate") return terminateModal(c);
      if (v === "Archive") return reason(`Archive ${c.number}?`, "Reason", "Archive", async (x) => (await ctApi.archive(c.id, x), `${c.number} archived — history and signed files retained.`));
      if (v === "Mark will not renew") return wnrModal(c);
    };

    // ── signature wizard (7 steps) ────────────────────────────────────────
    const SW = ["Document", "Signers", "Fields", "Authentication", "Reminders & expiry", "Review", "Send"];
    const sigWizard = (s: number, d: Wiz): void => {
      const back = s > 0 ? () => sigWizard(s - 1, d) : undefined;
      const base = { title: "New signature request", sub: step(SW, s), back, cancel: s > 0 ? "Back" : "Cancel", wide: true, primaryT: s === 6 ? "Finish" : "Next" };
      const next = (p: Wiz) => sigWizard(s + 1, { ...d, ...p });
      const signers = (d.signers as { name: string; email: string; role: string }[] | undefined) ?? [];
      const doc = opt?.signable.find((x) => x.v === d.docId);
      if (s === 0)
        return modal({
          ...base,
          fields: [F("docId", "Document / version", "select", { req: true, value: String(d.docId ?? ""), options: [{ v: "", t: (opt?.signable ?? []).length ? "Choose…" : "No document is ready to sign" }, ...(opt?.signable ?? []).map((x) => ({ v: x.v, t: x.contract ? `${x.t} · ${x.contract.number} ${x.contract.status}` : x.t }))] })],
          note: "Only documents with a stored file, not already signed and without an active request are listed. Contracts must be Approved first.",
          onSubmit: async (v) => {
            const x = opt?.signable.find((y) => y.v === sv(v, "docId"));
            if (x?.contract && !["Approved", "Signature Pending"].includes(x.contract.status)) return `APPROVAL_REQUIRED — contract ${x.contract.number} is ${x.contract.status}. It must be approved before signature.`;
            const pre = x?.contract
              ? [
                  ...(opt?.signatory ? [{ name: opt.signatory.name, email: opt.signatory.email ?? "", role: "Business Signatory" }] : []),
                  ...(x.contract.signer?.name ? [{ name: x.contract.signer.name, email: x.contract.signer.email ?? "", role: x.contract.cpRole }] : []),
                ]
              : signers;
            next({ docId: sv(v, "docId"), signers: signers.length ? signers : pre, order: d.order ?? x?.contract?.signer?.order ?? null, auth: d.auth ?? x?.contract?.signer?.auth ?? null });
            return "keep";
          },
        });
      if (s === 1)
        return modal({
          ...base,
          fields: [
            ...[0, 1, 2].flatMap((i) => [F(`n${i}`, `Signer ${i + 1} name`, "text", { value: signers[i]?.name ?? "", req: i === 0, af: i === 0 }), F(`e${i}`, "Email", "text", { value: signers[i]?.email ?? "" }), F(`r${i}`, "Role", "select", { value: signers[i]?.role ?? (i ? "Customer" : "Business Signatory"), options: O(SIG_ROLES) })]),
            F("order", "Signing order", "select", { value: String(d.order ?? opt?.cfg.order ?? "Sequential"), options: O(["Sequential", "Parallel"]) }),
          ],
          onSubmit: async (v) => {
            const L: { name: string; email: string; role: string }[] = [];
            for (let i = 0; i < 3; i++) {
              if (!sv(v, `n${i}`)) continue;
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sv(v, `e${i}`))) return `MISSING_SIGNER — signer ${i + 1} needs a valid email.`;
              L.push({ name: sv(v, `n${i}`), email: sv(v, `e${i}`), role: sv(v, `r${i}`) });
            }
            if (!L.length) return "MISSING_SIGNER — add at least one signer.";
            if (new Set(L.map((x) => x.email.toLowerCase())).size !== L.length) return "VALIDATION_ERROR — the same email appears twice.";
            next({ signers: L, order: sv(v, "order") });
            return "keep";
          },
        });
      if (s === 2)
        return modal({
          ...base,
          fields: [F("fields", "Fields captured", "checks", { options: O(["Signature", "Date", "Name"]).map((o) => ({ ...o, on: ((d.fields as string[]) ?? ["Signature", "Date", "Name"]).includes(o.v) })) })],
          note: "The signing page captures a typed or drawn signature with the signer’s name and the date. Placing fields on specific pages isn’t supported — the signature applies to the whole document version.",
          onSubmit: async (v) => {
            const f = (v.fields as string[]) ?? [];
            if (!f.includes("Signature")) return "Keep the Signature field.";
            next({ fields: f });
            return "keep";
          },
        });
      if (s === 3)
        return modal({
          ...base,
          fields: [F("auth", "Authentication", "select", { value: String(d.auth ?? opt?.cfg.authMethods.at(-1) ?? "Email"), options: O(opt?.cfg.authMethods ?? ["Email"]) })],
          note: "Email + OTP emails a 6-digit code the signer enters before signing.",
          onSubmit: async (v) => (next({ auth: sv(v, "auth") }), "keep"),
        });
      if (s === 4)
        return modal({
          ...base,
          fields: [F("reminders", "Reminders", "select", { value: String(d.reminders ?? opt?.cfg.reminders ?? "Every 3 days"), options: O(["Daily", "Every 3 days", "Weekly", "Off"]) }), F("deadline", "Expires", "date", { value: String(d.deadline ?? iso(opt?.cfg.expiryDays ?? 14)) })],
          onSubmit: async (v) => {
            if (sv(v, "deadline") <= iso(0)) return "Expiry must be in the future.";
            next({ reminders: sv(v, "reminders"), deadline: sv(v, "deadline") });
            return "keep";
          },
        });
      if (s === 5)
        return modal({
          ...base,
          fields: [F("sum", "Review", "read", { value: [`Document: ${doc?.t ?? ""}`, `Signers (${String(d.order)}): ${signers.map((x, i) => `${d.order === "Sequential" ? `${i + 1}. ` : ""}${x.name} <${x.email}> · ${x.role}`).join("; ")}`, `Fields: ${((d.fields as string[]) ?? []).join(", ")}`, `Authentication: ${String(d.auth)}`, `Reminders: ${String(d.reminders)} · expires ${String(d.deadline)}`].join("\n") })],
          onSubmit: async () => (next({}), "keep"),
        });
      return modal({
        ...base,
        fields: [F("go", "Send now?", "select", { options: O([["send", "Email the signing links now"], ["draft", "Save as prepared (send later)"]]) })],
        note: "“Sent” shows once the email provider accepts each email. The document version is locked while it’s out for signature.",
        onSubmit: async (v) => {
          const r = await ctApi.prepare({ docId: d.docId, signers, order: d.order, fields: d.fields ?? ["Signature", "Date", "Name"], auth: d.auth, reminders: d.reminders, deadline: d.deadline, send: sv(v, "go") === "send" });
          await after(`${r.number} ${r.status === "Prepared" ? "prepared — send it when ready" : "sent"}.${r.message ? ` ${r.message}` : ""}`);
        },
      });
    };
    const sigAction = async (id: string, v: string, dv?: CtDrawer) => {
      if (v === "Open") return open("sig", id);
      if (v === "Evidence pack") return open("evidence", id);
      if (v === "Send" || v === "Resend") return run(async () => (await ctApi.send(id)).message);
      if (v === "Remind") return run(async () => `Reminder emailed to ${(await ctApi.remind(id)).to.join(", ") || "nobody (delivery failed)"}.`);
      if (v === "Download signed document") return dl(() => ctApi.signedDoc(id));
      const r = (dv?.ref ?? (await ref("sig", id))) as { number: string; contract: string | null; signers: { id: string; name: string }[]; pending: string[]; doc: string };
      if (v === "Open contract" && r.contract) return go("detail", r.contract);
      if (v === "Void")
        return reason(`Void ${r.number}?`, "Reason", "Void request", async (x) => (await ctApi.void(id, x), `${r.number} voided — signing links stop working; the document version is unlocked.`), { danger: true, sub: `${r.doc} · remaining signers: ${r.pending.join(", ") || "none"}` });
      if (v === "Signing link")
        return modal({
          title: `Signing link · ${r.number}`,
          sub: "For in-person signing or when email can’t reach the signer. Issuing a link replaces any earlier link for that signer.",
          primaryT: "Create link",
          fields: [F("signerId", "Signer", "select", { options: r.signers.map((x) => ({ v: x.id, t: x.name })) })],
          onSubmit: async (w) => {
            const l = await ctApi.link(id, sv(w, "signerId"));
            await refresh();
            modal({ title: "Signing link", sub: l.note, primaryT: "Copy link", cancel: "Close", fields: [F("url", "Link", "read", { value: l.url })], onSubmit: async () => void (await navigator.clipboard.writeText(l.url).then(() => flash("Link copied."))) });
            return "keep";
          },
        });
    };

    // ── approvals ─────────────────────────────────────────────────────────
    const decideModal = async (id: string) => {
      const a = await ref<{ id: string; number: string; kind: string; ent: string | null; type: string; changes: string; reason: string; step: string | null; value: string | null; requester: string }>("apr", id);
      if (!a.step) return flash("This approval is complete.");
      modal({
        title: `Decision · ${a.type}`,
        sub: `${a.kind} ${a.ent ?? ""} · ${a.changes} · step ${a.step}`,
        primaryT: "Record decision",
        pBg: "#0A1B2A",
        fields: [
          F("sum", "You are deciding on", "read", { value: [`Record: ${a.kind} ${a.ent ?? ""}`, `Version / change: ${a.changes}`, `Why: ${a.reason}`, a.value ? `Linked value: ${a.value}` : "", a.kind === "Contract" ? "Signature impact: approval unlocks Send for signature" : ""].filter(Boolean).join("\n") }),
          F("dec", "Decision", "select", { req: true, options: O([["", "Choose…"], "Approve", "Reject", "Request changes", "Delegate", "Escalate"]) }),
          F("to", "Delegate to (if delegating)", "select", { options: [{ v: "", t: "—" }, ...memberOpts()] }),
          F("comment", "Comment", "area", { rows: 2 }),
        ],
        onSubmit: async (v) => {
          if (["Reject", "Request changes"].includes(sv(v, "dec")) && !sv(v, "comment")) return "Add a comment explaining the decision.";
          if (sv(v, "dec") === "Delegate" && !sv(v, "to")) return "Choose who to delegate to.";
          const r = await ctApi.decide(id, { dec: sv(v, "dec"), comment: sv(v, "comment"), toUserId: sv(v, "to") || null });
          await after(r.message);
        },
      });
    };

    // ── expiries ──────────────────────────────────────────────────────────
    type ExpRef = { id: string; kind: string; ref: string; refId: string; title: string; type: string; owner: string; notice: string | null; noticeDays: number | null; exp: string; expDays: number };
    const taskModal = (label: string, ref0: string, o: { contractId?: string; obligationId?: string; ownerId?: string; due?: string } = {}) =>
      modal({
        title: "Create task",
        sub: label,
        primaryT: "Create in Projects & Tasks",
        note: (opt?.projects ?? []).length ? null : "No open project in this branch to hold the task — create one in Projects & Tasks first.",
        fields: [F("projectId", "Project", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...(opt?.projects ?? [])] }), F("assigneeId", "Assignee", "select", { value: o.ownerId ?? "", options: [{ v: "", t: "Me" }, ...memberOpts()] }), F("due", "Due", "date", { value: o.due ?? iso(3) })],
        onSubmit: async (v) => void (await after(`${(await ctApi.task({ projectId: sv(v, "projectId"), title: label.slice(0, 255), assigneeId: sv(v, "assigneeId") || undefined, due: sv(v, "due"), ref: ref0, contractId: o.contractId, obligationId: o.obligationId })).number} created in Projects & Tasks.`)),
      });
    const expAction = async (id: string, v: string, dv?: CtDrawer) => {
      if (v === "Open renewal") return open("exp", id);
      const e = (dv?.ref ?? (await ref("exp", id))) as ExpRef;
      if (v === "Open source") return e.kind === "Contract" ? go("detail", e.ref) : open(e.kind === "Document" ? "doc" : "cmp", e.refId);
      if (v === "Create renewal draft" || v === "Renew") return renewModal(await ctRef(e.refId));
      if (v === "Mark will not renew") return wnrModal(await ctRef(e.refId));
      if (v === "Snooze")
        return modal({
          title: `Snooze · ${e.title}`,
          primaryT: "Snooze",
          note: e.notice ? `Notice deadline: ${e.notice}${(e.noticeDays ?? 1) < 0 ? " (already passed)" : ""}` : null,
          fields: [F("until", "Until", "date", { req: true, value: iso(7) }), F("reason", "Reason", "text", { req: true, af: true }), F("ok", "Past notice deadline?", "select", { options: O([["", "Block if past the notice deadline"], ["1", "I understand the notice deadline risk"]]) })],
          onSubmit: async (w) => void (await after((await ctApi.snooze({ key: id, until: sv(w, "until"), reason: sv(w, "reason"), ok: sv(w, "ok") === "1" }), `Snoozed until ${sv(w, "until")}.`))),
        });
      if (v === "Create task") return taskModal(`Renewal decision · ${e.title}`, e.ref, { due: e.noticeDays != null && e.noticeDays > 3 ? iso(e.noticeDays - 3) : iso(3) });
      if (v === "Notify owner" || v === "Request replacement") {
        const kind = v === "Notify owner" ? "notify" : "replace";
        return modal({
          title: kind === "notify" ? "Notify owner" : "Request replacement document",
          sub: kind === "notify" ? `${e.owner} gets an in-app notification.` : "Emailed to the linked counterparty (or an in-app notification for staff).",
          primaryT: "Send",
          fields: [F("msg", "Message", "area", { value: kind === "notify" ? `${e.title} expires ${e.exp}.${e.notice ? ` Notice deadline ${e.notice}.` : ""}` : `Please send the renewed ${e.type.toLowerCase()} for “${e.title}” before ${e.exp}.`, req: true })],
          onSubmit: async (w) => void (await after(`Sent to ${(await ctApi.message({ kind, key: id, msg: sv(w, "msg") })).to}.`)),
        });
      }
    };

    // ── compliance ────────────────────────────────────────────────────────
    type CmpRef = { id: string; number: string; title: string; version: number; hasDoc: boolean; aud: string; pending: number; tot: number; exp: string | null; ack: boolean };
    const cmpUpload = (x?: CmpRef) =>
      modal({
        title: x ? `${x.hasDoc ? "Upload replacement" : "Upload evidence"} · ${x.title}` : "Upload compliance document",
        primaryT: "Upload",
        wide: !x,
        fields: [
          F("file", "File", "file", { req: !!x }),
          ...(x
            ? []
            : [
                F("title", "Title", "text", { req: true, af: true }),
                F("type", "Type", "select", { options: O(CMP_TYPES) }),
                F("jurisdiction", "Jurisdiction", "text", { ph: "e.g. Punjab, PK" }),
                F("audience", "Audience", "select", { options: [...O(["All staff"]), ...(opt?.branches ?? []).map((b) => ({ v: `Branch:${b.v}`, t: `Branch: ${b.t}` })), ...O(["Customers", "Suppliers"])] }),
                F("ack", "Mandatory acknowledgement", "select", { options: O([["", "No"], ["1", "Yes — staff acknowledge in Noxtill"]]) }),
              ]),
          F("eff", "Effective date", "date", { value: iso(0) }),
          F("exp", "Expiry date", "date", { value: x?.exp ?? iso(365) }),
          ...(x?.hasDoc ? [F("material", "Material change?", "select", { options: O([["", "No — minor correction (acknowledgements kept)"], ["1", "Yes — new version, everyone re-acknowledges"]]) })] : []),
        ],
        onSubmit: async (v) => {
          const b = { title: sv(v, "title"), type: sv(v, "type"), jurisdiction: sv(v, "jurisdiction"), audience: sv(v, "audience"), ack: sv(v, "ack") === "1", eff: sv(v, "eff"), exp: sv(v, "exp") || null, material: sv(v, "material") === "1" };
          if (x) return void (await after(`Evidence uploaded — now v${(await ctApi.cmpUpload(x.id, b, v.file as File | null)).version}.`));
          const r = await ctApi.newCompliance(b, v.file as File | null);
          await after(`${r.number} registered${r.doc ? ` with evidence ${r.doc}` : " — no evidence yet"}.`);
        },
      });
    const cmpAction = async (id: string, v: string) => {
      if (v === "Open") return open("cmp", id);
      if (v === "Evidence pack") return open("cmpev", id);
      if (v === "Acknowledge") return run(async () => (await ctApi.cmpAck(id), "Acknowledged — recorded with the current version."));
      if (v === "Restore") return run(async () => (await ctApi.cmpRestore(id), "Restored."));
      const x = await ref<CmpRef>("cmp", id);
      if (v === "Upload evidence" || v === "Upload replacement") return cmpUpload(x);
      if (v === "Request acknowledgement")
        return modal({
          title: `Request acknowledgement · ${x.title}`,
          sub: `${x.pending} of ${x.tot} pending · v${x.version} · in-app notification`,
          primaryT: "Send",
          fields: [F("scope", "Audience", "select", { options: O([["pending", "Only people who haven’t acknowledged"], ["all", `Everyone in ${x.aud}`]]) }), F("msg", "Message", "area", { value: `Please read and acknowledge ${x.title} v${x.version}.` })],
          onSubmit: async (w) => void (await after(`${(await ctApi.cmpRequestAck(id, sv(w, "scope"), sv(w, "msg"))).n} person(s) notified.`)),
        });
      if (v === "Publish") return confirm(`Publish ${x.title} v${x.version}?`, `Publishing locks this evidence version${x.ack ? ` and asks ${x.aud} to acknowledge` : ""}.`, "Publish", async () => `Published${(await ctApi.cmpPublish(id)).requested ? " — acknowledgement requests sent" : ""}.`);
      if (v === "Archive") return reason(`Archive ${x.title}?`, "Reason", "Archive", async (r) => (await ctApi.cmpArchive(id, r), "Archived — evidence and acknowledgement logs retained."));
    };

    // ── row / top actions ─────────────────────────────────────────────────
    const rowAction = async (b: string, id: string, v: string) => {
      const s = st.getState();
      if (b === "ov-att") {
        const [kind, refId] = id.split(":");
        if (kind === "sig") return v === "Remind" ? sigAction(refId, "Remind") : v === "Resend" ? sigAction(refId, "Resend") : open("sig", refId);
        if (kind === "apr") return v === "Review" ? decideModal(refId).catch((e) => flash(errText(e))) : open("apr", refId);
        if (kind === "exp") return open("exp", refId);
        if (kind === "cmp") return v === "Upload" ? cmpUpload(await ref<CmpRef>("cmp", refId)) : open("cmp", refId);
        if (kind === "doc") return open("doc", refId);
        if (kind === "ctr") return go("detail", refId);
      }
      if (b === "ov-exp" || b === "exp") return expAction(id, v);
      if (b === "doc") return docAction(id, v);
      if (b === "tpl") return tplAction(id, v);
      if (b === "ct") return ctAction(id, v);
      if (b === "sig") return sigAction(id, v);
      if (b === "apr" || b === "d-a") return v === "Decide" ? decideModal(id).catch((e) => flash(errText(e))) : open("apr", id);
      if (b === "cmp") return cmpAction(id, v);
      if (b === "fold") return st.getState().set({ view: { ...s.view, docView: "table" }, f: { ...s.f, doc: { folder: id } }, page: {} });
      if (b === "d-doc") {
        const [did, ver] = id.split("|");
        return dl(() => ctApi.downloadDoc(did, Number(ver)));
      }
      if (b === "d-s") return open("sig", id.split("|")[0]);
      if (b === "d-p" || b === "d-rel") {
        const [, mod, rid] = id.split("|");
        if (b === "d-p") {
          const c = await ctRef(s.cur);
          const h = moduleHref("", c.cp);
          return h ? router.push(h) : undefined;
        }
        if (mod === "Contracts") return go("detail", (await ctRef(rid)).number);
        const h = moduleHref(mod, rid);
        return h ? router.push(h) : flash(`${mod} owns this record.`);
      }
      const c = await ctRef(s.cur);
      if (b === "d-t") {
        const t = c.terms.find((x) => x.id === id);
        if (!t) return;
        return modal({ title: `Correct term · ${t.term}`, primaryT: "Save correction", fields: [F("value", "Correct value", "text", { req: true, af: true, value: t.value }), F("source", "Source clause / page", "text", { value: t.source })], onSubmit: async (w) => void (await after((await ctApi.term(c.id, { value: sv(w, "value"), source: sv(w, "source") }, id), "Term corrected — audited."))) });
      }
      if (b === "d-o") {
        const o = c.obls.find((x) => x.id === id);
        if (!o) return;
        if (v === "Mark completed")
          return modal({
            title: "Complete obligation",
            sub: o.title,
            primaryT: "Mark completed",
            fields: [F("evidenceDocId", "Evidence document", "select", { options: [{ v: "", t: "None" }, ...(opt?.docs ?? [])] }), F("note", "Note", "text")],
            onSubmit: async (w) => void (await after(`Completed${(await ctApi.oblDone(c.id, id, { evidenceDocId: sv(w, "evidenceDocId") || null, note: sv(w, "note") })).next}.`)),
          });
        if (v === "Waive") return reason("Waive obligation?", "Reason", "Waive", async (r) => (await ctApi.oblDone(c.id, id, { note: r, waive: true }), "Obligation waived — audited."), { sub: o.title });
        if (v === "Create task") return taskModal(`${o.title} · ${c.number}`, c.number, { contractId: c.id, obligationId: id, ownerId: o.ownerId, due: o.due });
      }
      if (b === "d-am") {
        const m = c.amends.find((x) => x.id === id);
        if (!m) return;
        if (v === "Submit for approval") return reason(`Submit ${m.number} for approval`, "Note for approvers", "Submit", async (r) => `${(await ctApi.submitAmend(c.id, id, r)).approval} started.`, { req: false });
        if (v === "Send for signature") return sigWizard(0, { docId: m.docId ?? "" });
        if (v === "Open document" && m.docId) return open("doc", m.docId);
      }
    };

    const exportModal = (ids: string[] = []) =>
      modal({
        title: "Export",
        sub: "Respects your filters, permissions and sensitivity. Restricted fields are omitted.",
        primaryT: "Download",
        fields: [F("what", "Export", "select", { value: st.getState().tab === "contracts" ? "Contract register" : st.getState().tab === "expiries" ? "Expiry report" : st.getState().tab === "compliance" ? "Compliance evidence" : "Document index", options: O(["Document index", ...(R?.contracts ? ["Contract register", "Expiry report"] : []), ...(R?.evidence ? ["Signature evidence"] : []), "Compliance evidence", "Audit"]) }), F("format", "Format", "select", { options: O([["csv", "CSV"], ["xlsx", "Excel (XLSX)"]]) })],
        onSubmit: async (v) => void flash(`${sv(v, "what")}: ${await ctApi.exportFile(sv(v, "what"), sv(v, "format"), scope(), ids)} row(s) downloaded.`),
      });

    const top = async (k: string) => {
      const s = st.getState();
      if (k === "refresh") return after("Reloaded.");
      if (k === "new")
        return modal({
          title: "New",
          primaryT: "Continue",
          fields: [F("what", "What do you want to create?", "select", { options: O([["upload", "Upload document"], ...(R?.manage ? ([["ct", "New contract"], ["tpl", "Create template"], ["sig", "Request signature"]] as [string, string][]) : []), ["req", "Request document from someone"]]) })],
          onSubmit: async (v) => {
            const w = sv(v, "what");
            if (w === "upload") uploadModal();
            else if (w === "ct") ctWizard(0, {});
            else if (w === "tpl") tplModal();
            else if (w === "sig") sigWizard(0, {});
            else void top("reqdoc");
            return "keep";
          },
        });
      if (k === "upload") return uploadModal();
      if (k === "newct") return ctWizard(0, {});
      if (k === "import") return ctWizard(1, { src: "upload" });
      if (k === "newtpl") return tplModal();
      if (k === "newsig") return sigWizard(0, {});
      if (k === "cmp-up") return cmpUpload();
      if (k === "newfolder") return modal({ title: "New folder", primaryT: "Create", fields: [F("name", "Folder name", "text", { req: true, af: true })], onSubmit: async (v) => void (await after((await ctApi.folder(sv(v, "name")), `Folder “${sv(v, "name")}” created (settings version bumped).`))) });
      if (k === "reqdoc")
        return modal({
          title: "Request a document",
          sub: "Staff get an in-app notification; customers and suppliers get an email at the address on their record. Upload what they send back.",
          primaryT: "Send request",
          fields: [F("party", "From", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...partyOpts()] }), F("what", "What document?", "text", { req: true, af: true, ph: "e.g. Renewed DRAP certificate" }), F("due", "Needed by", "date", { value: iso(7) })],
          onSubmit: async (v) => void (await after(`Request sent to ${(await ctApi.requestDoc(sv(v, "party"), sv(v, "what"), sv(v, "due"))).to}.`)),
        });
      if (k === "vars") return open("vars", "_");
      if (k === "storage") return open("storage", "_");
      if (k === "audit") return open("audit", "_");
      if (k === "export") return exportModal();
      if (k === "test-prov") return ctApi.emailHealth().then((r) => flash(r.message)).catch((e) => flash(errText(e)));
      if (k === "ext:business-brain") return router.push("/business-brain");
      if (k.startsWith("go:")) return go(k.slice(3));
      if (k.startsWith("clear:")) return st.getState().set({ f: { ...s.f, [k.slice(6)]: {} }, page: {} });
      if (k === "bk-move" || k === "bk-tag") return moveTag(k === "bk-move" ? "move" : "tag", s.sel);
      if (k === "bk-export") return exportModal(s.sel);
      if (k === "bk-owner")
        return modal({ title: `Assign owner to ${s.sel.length} contract(s)`, primaryT: "Assign", fields: [F("ownerId", "New owner", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...memberOpts()] })], onSubmit: async (v) => void (await after(`${(await ctApi.bulkOwner(s.sel, sv(v, "ownerId"))).n} contract(s) reassigned.`), st.getState().set({ sel: [] })) });
      if (k === "bk-review")
        return reason(`Request review for ${s.sel.length} contract(s)`, "Note", "Request review", async (r) => `${(await ctApi.bulkReview(s.sel, r)).n} owner notification(s) sent — no status change.`, { req: false });
      if (k.startsWith("d:")) {
        const a = k.slice(2);
        if (a.startsWith("tab:")) return st.getState().set({ view: { ...s.view, dTab: a.slice(4) } });
        const c = await ctRef(s.cur);
        if (a === "review-apr") return c.openApproval ? open("apr", c.openApproval) : flash("No open approval.");
        if (a === "more")
          return modal({ title: `Actions · ${c.number}`, primaryT: "Continue", fields: [F("act", "Action", "select", { options: O(c.acts) })], onSubmit: async (v) => void (await ctAction(c.id, sv(v, "act"))) });
        if (a === "Download") return c.docId ? dl(() => ctApi.downloadDoc(c.docId!)) : flash("No document linked.");
        if (a === "evidence") return c.completedSig ? open("evidence", c.completedSig) : flash("No completed signature yet — no evidence pack.");
        if (a === "add-term") return modal({ title: `Add term · ${c.number}`, primaryT: "Add term", fields: [F("term", "Term", "text", { req: true, af: true }), F("value", "Value", "text", { req: true }), F("source", "Source clause / page", "text", { req: true, ph: "e.g. Clause 8.1, p.5" })], onSubmit: async (v) => void (await after((await ctApi.term(c.id, { term: sv(v, "term"), value: sv(v, "value"), source: sv(v, "source") }), "Term added."))) });
        if (a === "add-obl")
          return modal({
            title: `Add obligation · ${c.number}`,
            primaryT: "Add",
            fields: [F("title", "Obligation", "text", { req: true, af: true }), F("responsible", "Responsible party", "select", { options: O(["Business", "Counterparty", "Both"]) }), F("ownerId", "Owner", "select", { value: c.ownerId, options: memberOpts() }), F("due", "Due", "date", { req: true, value: iso(30) }), F("frequency", "Frequency", "select", { options: O(["Once", "Monthly", "Quarterly", "Annual"]) })],
            onSubmit: async (v) => void (await after((await ctApi.obligation(c.id, { title: sv(v, "title"), responsible: sv(v, "responsible"), ownerId: sv(v, "ownerId"), due: sv(v, "due"), frequency: sv(v, "frequency") }), "Obligation added."))),
          });
        if (a === "wnr") return wnrModal(c);
        return ctAction(c.id, a);
      }
    };

    const drawerAct = (k: string, kind: string, id: string, dv?: CtDrawer) => {
      const i = k.indexOf(":");
      const p = i < 0 ? k : k.slice(0, i);
      const v = i < 0 ? "" : k.slice(i + 1);
      if (k === "ev-dl")
        return ctApi
          .evidence(kind === "cmpev" ? "cmp" : "sig", id)
          .then(() => flash("Evidence pack (JSON manifest) downloaded."))
          .catch((e) => flash(errText(e)));
      if (p === "doc") return void docAction(id, v, dv);
      if (p === "sig") return void sigAction(id, v, dv);
      if (p === "exp") return void expAction(id, v, dv);
      if (p === "cmp") return void cmpAction(id, v);
      if (p === "tpl") return void tplAction(id, v);
      if (p === "apr") {
        const r = dv?.ref as { kind: string; contract: string | null; entityId: string } | undefined;
        if (v === "decide") return void decideModal(id).catch((e) => flash(errText(e)));
        if (r?.contract) return go("detail", r.contract);
        if (r?.kind === "Template") return open("tplprev", r.entityId);
        if (r?.kind === "Document") return open("doc", r.entityId);
        return;
      }
      return void top(k);
    };

    // ── settings ──────────────────────────────────────────────────────────
    const settingsBtn = (k: string) => {
      if (k === "set-reset") return st.getState().set({ draft: {} });
      return void top(k);
    };

    const kpiClick = (k: string) => {
      const [p, x] = k.split(":");
      const s = st.getState();
      if (p === "dt") return st.getState().set({ view: { ...s.view, dTab: x } });
      const map: Record<string, Record<string, [string, Record<string, string>, string] | null>> = {
        o: { docs: ["documents", {}, "doc"], active: ["contracts", { st: "Active" }, "ct"], apr: ["approvals", { st: "Pending" }, "apr"], sig: ["signatures", { st: "Partially Signed" }, "sig"], exp: ["expiries", { due: "30" }, "exp"], expd: ["expiries", { due: "past" }, "exp"], fail: ["documents", { st: "Partial" }, "doc"], ret: ["documents", {}, "doc"] },
        d: { all: ["documents", {}, "doc"], new: ["documents", {}, "doc"], rev: ["documents", { st: "Approval Pending" }, "doc"], exp: ["documents", { exp: "30" }, "doc"], res: ["documents", { sens: "Confidential" }, "doc"], store: null },
        c: { Active: ["contracts", { st: "Active" }, "ct"], Draft: ["contracts", { st: "Draft" }, "ct"], "Approval Required": ["contracts", { st: "Approval Required" }, "ct"], sig: ["contracts", { st: "Signature Pending" }, "ct"], "30": ["contracts", { ren: "30" }, "ct"], "Renewal Review": ["contracts", { st: "Renewal Review" }, "ct"], risk: ["contracts", { risk: "At Risk" }, "ct"], val: null },
        e: { "7": ["expiries", { due: "7" }, "exp"], "30": ["expiries", { due: "30" }, "exp"], "90": ["expiries", { due: "90" }, "exp"], rev: ["expiries", { st: "Review Required" }, "exp"], auto: ["expiries", { auto: "yes" }, "exp"], notice: ["expiries", {}, "exp"], exp: ["expiries", { due: "past" }, "exp"], repl: ["expiries", { repl: "1" }, "exp"] },
      };
      if (p === "s") return go("signatures", undefined, { st: x }, "sig");
      if (p === "a") return go("approvals", undefined, { st: x }, "apr");
      if (p === "k") return go("compliance", undefined, { st: ["Expiring Soon", "Missing Evidence", "Acknowledgement Pending", "Expired", "Active"].includes(x) ? x : "" }, "cmp");
      if (p === "t") return go("templates", undefined, { st: ["Published", "Draft"].includes(x) ? x : "" }, "tpl");
      const t = map[p]?.[x];
      if (t === null) return x === "store" ? open("storage", "_") : flash("Referenced values are informational only; Finance owns accounting.");
      if (t) go(t[0], undefined, t[1], t[2]);
    };

    const handlers: Omit<RenderHandlers, "sel"> = {
      kpiClick,
      blockAct: (k) => void top(k),
      segPick: (b, k) => {
        const s = st.getState();
        const vk = ({ doc: "docView", fold: "docView", ct: "ctCols", "d-h": "dTab", exp: "expView", "exp-cal": "expView" } as Record<string, string>)[b];
        if (vk) st.getState().set({ view: { ...s.view, [vk]: k }, page: {} });
      },
      setQ: (b, v) => {
        const s = st.getState();
        st.getState().set({ f: { ...s.f, [b]: { ...(s.f[b] ?? {}), q: v } }, page: {} });
      },
      setF: (b, k, v) => {
        const s = st.getState();
        const fb = b === "ov-f" ? "ov" : b;
        st.getState().set({ f: { ...s.f, [fb]: { ...(s.f[fb] ?? {}), [k]: v } }, page: {}, sel: [] });
      },
      clearF: (b) => {
        const s = st.getState();
        st.getState().set({ f: { ...s.f, [b === "ov-f" ? "ov" : b]: {} }, page: {} });
      },
      pageGo: (d) => st.getState().set((s) => ({ page: { ...s.page, [s.tab]: Math.max(0, (s.page[s.tab] ?? 0) + d) } })),
      selRow: (id) => st.getState().set((s) => ({ sel: s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id] })),
      selAll: (ids) => st.getState().set({ sel: ids }),
      rowOpen: (b, id) => {
        const def: Record<string, string> = { "ov-att": "Open", "ov-exp": "Open renewal", exp: "Open renewal", doc: "Open", tpl: "Preview", ct: "Open", sig: "Open", apr: "Open", cmp: "Open", "d-a": "Open", "d-s": "Open", "d-am": "Open document", "d-rel": "Open" };
        if (def[b]) void rowAction(b, id, def[b]);
      },
      rowAct: (b, id, v) => void rowAction(b, id, v).catch((e) => flash(errText(e))),
      cardOpen: (b, id) => void rowAction(b, id, "Open"),
      calOpen: (_b, id) => open("exp", id),
    };

    return { handlers, top: (k: string) => void top(k).catch((e: unknown) => flash(errText(e))), drawerAct, settingsBtn, after, flash, run, go, getPath, setPath };
  }, [opt, qc, router]);
}
