"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fsApi, fsDownload, type FsDrawer, type FsOptions, type FsScreen } from "@/lib/field-service-api";
import type { RenderHandlers } from "@/components/payments/pay-render";
import { getPath, setPath, type AField, type AModal, type AValues } from "@/components/assets/am-store";
import { fsScopeOf, useFs } from "./fs-store";
import { newKey, sendOrQueue, syncQueue } from "./fs-offline";

export const FS_PATH: Record<string, string> = {
  overview: "",
  requests: "/requests",
  workorders: "/work-orders",
  dispatch: "/dispatch",
  calendar: "/calendar",
  map: "/map",
  detail: "/work-orders/",
  technician: "/technician",
  inspections: "/inspections",
  parts: "/parts",
  labor: "/time-labor",
  equipment: "/equipment",
  pm: "/preventive-maintenance",
  agreements: "/service-agreements",
  warranty: "/warranty",
  settings: "/settings",
};
export const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

const F = (name: string, label: string, type: AField["type"] = "text", o: Partial<AField> = {}): AField => ({ name, label, type, ...o });
const O = (a: (string | [string, string])[]) => a.map((x) => (typeof x === "string" ? { v: x, t: x } : { v: x[0], t: x[1] }));
const sv = (v: AValues, k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
const hh = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const timeOpts = () => {
  const o: { v: string; t: string }[] = [];
  for (let h = 6; h <= 22; h += 0.5) o.push({ v: String(h), t: hh(h) });
  return o;
};
const dayLabel = (d: number) => (d === 0 ? "Today" : d === 1 ? "Tomorrow" : new Date(Date.now() + d * 86400000).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }));
const dayOpts = (n = 7) => Array.from({ length: n }, (_, d) => ({ v: String(d), t: dayLabel(d) }));
const today = () => new Date().toISOString().slice(0, 10);
const plusYear = () => new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
const LABOR = ["Travel", "Standard Labor", "Diagnostic", "Installation", "Repair", "Inspection", "Waiting", "Training", "Other"];
const TRIAGE = ["Valid Service Request", "Need More Information", "Duplicate", "Covered by Warranty", "Covered by Agreement", "Chargeable Service", "Remote Resolution Possible", "Create Work Order", "Send to Helpdesk", "Reject"];
const CHANNELS = ["Phone", "Unified Inbox", "Customer Portal", "Helpdesk", "Website", "API"];
const split = (id: string) => id.split("|") as [string, string | undefined];

export function useFsActions(opt: FsOptions | undefined) {
  const router = useRouter();
  const qc = useQueryClient();
  return useMemo(() => {
    const st = useFs;
    const R = opt?.rights;
    const flash = (t: string) => st.getState().flash(t);
    const modal = (m: AModal) => st.getState().openModal(m);
    const refresh = () => qc.invalidateQueries({ queryKey: ["fs"] });
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
    const go = (tab: string, id?: string, filt?: Record<string, string>, fk?: string) => {
      const s = st.getState();
      st.getState().set({ drawer: null, sel: [], page: {}, ...(id ? { cur: id, view: { ...s.view, wTab: "ov" } } : {}), ...(filt && fk ? { f: { ...s.f, [fk]: filt } } : {}) });
      router.push(`/field-service${tab === "detail" ? `/work-orders/${id ?? s.cur}` : FS_PATH[tab]}`);
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    };
    const reason = (title: string, label: string, primaryT: string, fn: (r: string) => Promise<string>, o: { danger?: boolean; sub?: string; req?: boolean; value?: string } = {}) =>
      modal({ title, sub: o.sub, primaryT, pBg: o.danger ? "#B42318" : "#12A150", fields: [F("reason", label, "text", { req: o.req !== false, af: true, value: o.value })], onSubmit: async (v) => void (await after(await fn(sv(v, "reason")))) });
    const confirm = (title: string, sub: string, primaryT: string, fn: () => Promise<string>, danger = false) => modal({ title, sub, primaryT, pBg: danger ? "#B42318" : "#12A150", fields: [], onSubmit: async () => void (await after(await fn())) });
    const msgOf = (r: { msg?: string } | null | undefined, d: string) => r?.msg ?? d;

    // ── option lists ──────────────────────────────────────────────────────
    const cus = () => (opt?.customers ?? []).map((c) => ({ v: c.id, t: c.name }));
    const cname = (id?: string | null) => opt?.customers.find((c) => c.id === id)?.name ?? "—";
    const svcOpts = () => (opt?.services ?? []).filter((s) => s.active).map((s) => ({ v: s.id, t: `${s.name} · ${s.skill}` }));
    const svc = (id?: string | null) => opt?.services.find((s) => s.id === id);
    const pname = (id: string) => opt?.products.find((p) => p.id === id)?.name ?? "Product";
    const siteOpts = (customerId?: string) => (opt?.sites ?? []).filter((s) => !customerId || s.customerId === customerId).map((s) => ({ v: s.id, t: `${s.label} · ${s.zone}${customerId ? "" : ` · ${cname(s.customerId)}`}` }));
    const eqOpts = (customerId?: string) => (opt?.equipment ?? []).filter((x) => !customerId || x.customerId === customerId).map((x) => ({ v: x.id, t: `${x.number} · ${x.name}${x.serial ? ` · ${x.serial}` : ""}${customerId ? "" : ` · ${cname(x.customerId)}`}` }));
    const zoneOpts = () => (opt?.cfg.territories ?? []).map((z) => ({ v: z, t: z }));
    const prioOpts = () => O(opt?.cfg.priorities ?? []);

    // ── requests ──────────────────────────────────────────────────────────
    const requestModal = (d: { customerId?: string; assetId?: string; issue?: string; dup?: string; data?: Record<string, unknown> } = {}) => {
      const x = d.assetId ? opt?.equipment.find((e) => e.id === d.assetId) : undefined;
      const c = d.customerId ?? x?.customerId ?? "";
      modal({
        title: "New service request",
        sub: "Customer and asset come from CRM and Assets — nothing is copied.",
        primaryT: d.dup ? "Create anyway" : "Create request",
        wide: true,
        note: d.dup ? `⚠ Possible duplicate: ${d.dup} is still open for this customer and asset.` : null,
        fields: [
          F("customerId", "Customer (CRM)", "select", { req: true, value: c, options: [{ v: "", t: "Search customers…" }, ...cus()] }),
          F("siteId", "Site", "select", { value: x?.siteId ?? "", options: [{ v: "", t: "Customer’s main site / new site below" }, ...siteOpts(c || undefined)] }),
          F("newAddress", "New site address (if not listed)", "text", { ph: "Street, area" }),
          F("newZone", "New site territory", "select", { options: [{ v: "", t: "—" }, ...zoneOpts()] }),
          F("assetId", "Asset / equipment", "select", { value: d.assetId ?? "", options: [{ v: "", t: "None / unknown" }, ...eqOpts(c || undefined)] }),
          F("serviceTypeId", "Service type", "select", { options: [{ v: "", t: "Decide at triage" }, ...svcOpts()] }),
          F("issue", "Problem description", "area", { req: true, af: true, value: d.issue ?? "" }),
          F("priority", "Priority", "select", { value: "Normal", options: prioOpts() }),
          F("window", "Preferred time window", "text", { ph: "e.g. Tomorrow AM" }),
          F("channel", "Source", "select", { options: O(CHANNELS) }),
          F("sourceRef", "Source reference", "text", { ph: "Conversation / ticket reference (optional)" }),
          F("photo", "Photo / attachment", "file", { accept: "image/*,application/pdf" }),
          F("safety", "Access / safety notes", "text"),
        ],
        onSubmit: async (v) => {
          const data = {
            customerId: sv(v, "customerId"),
            siteId: sv(v, "siteId") || null,
            newSite: sv(v, "newAddress") ? { address: sv(v, "newAddress"), zone: sv(v, "newZone") } : null,
            assetId: sv(v, "assetId") || null,
            serviceTypeId: sv(v, "serviceTypeId") || null,
            issue: sv(v, "issue"),
            priority: sv(v, "priority"),
            window: sv(v, "window"),
            channel: sv(v, "channel"),
            sourceRef: sv(v, "sourceRef"),
            safety: sv(v, "safety"),
            dupOk: !!d.dup,
          };
          const r = await fsApi.createRequest(data, (v.photo as File | null) ?? null);
          if (r.dup) {
            requestModal({ customerId: data.customerId, assetId: data.assetId ?? undefined, issue: data.issue, dup: r.dup });
            return "keep";
          }
          await after(`${r.number} created. Triage it next.`);
        },
      });
    };

    const triageModal = (id: string, number: string, issue: string) =>
      modal({
        title: `Triage ${number}`,
        sub: issue,
        primaryT: "Save triage",
        fields: [
          F("result", "Triage result", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...O(TRIAGE)] }),
          F("priority", "Priority", "select", { options: [{ v: "", t: "Keep current" }, ...prioOpts()] }),
          F("serviceTypeId", "Service type", "select", { options: [{ v: "", t: "Keep current" }, ...svcOpts()] }),
          F("note", "Triage note", "text"),
        ],
        note: "The service type sets the required skill, duration, checklist and default parts. You decide — nothing converts on its own.",
        onSubmit: async (v) => {
          const r = await fsApi.triage(id, { result: sv(v, "result"), priority: sv(v, "priority") || undefined, serviceTypeId: sv(v, "serviceTypeId") || undefined, note: sv(v, "note") || undefined });
          if (r.next === "reject") return void rejectModal(id, number);
          if (r.next === "convert") {
            await refresh();
            const dv = await fsApi.drawer("req", id, fsScopeOf(st.getState())).catch(() => null);
            return void convertModal(id, number, issue, sv(v, "priority") || String(dv?.ref?.priority ?? "Normal"), String(dv?.ref?.preview ?? ""));
          }
          await after(msgOf(r, "Triaged."));
        },
      });
    const convertModal = (id: string, number: string, issue: string, prio = "Normal", preview = "") =>
      modal({
        title: `Convert ${number} to work order`,
        sub: "Preview — nothing is created until you confirm.",
        primaryT: "Create work order",
        fields: [...(preview ? [F("sum", "Work order preview", "read", { value: preview })] : []), F("priority", "Priority", "select", { value: prio, options: prioOpts() }), F("scope", "Scope of work", "area", { req: true, value: issue })],
        onSubmit: async (v) => {
          const r = await fsApi.convert(id, { priority: sv(v, "priority"), scope: sv(v, "scope"), key: `conv_${id}` });
          await after(msgOf(r, "Converted."));
        },
      });
    const rejectModal = (id: string, number: string) =>
      modal({
        title: `Reject ${number}`,
        primaryT: "Reject request",
        pBg: "#B42318",
        fields: [F("reason", "Reason", "area", { req: true, af: true }), F("cust", "Customer-facing explanation (sent via Unified Inbox)", "text")],
        onSubmit: async (v) => void (await after(msgOf(await fsApi.rejectReq(id, { reason: sv(v, "reason"), cust: sv(v, "cust") || undefined }), "Rejected."))),
      });
    const moreInfoModal = (id: string, number: string) =>
      modal({
        title: `Request more information · ${number}`,
        primaryT: "Send via Unified Inbox",
        fields: [F("reason", "What do you need?", "area", { req: true, af: true, value: "Could you share a photo of the unit’s model plate and a good time for a visit?" })],
        onSubmit: async (v) => void (await after(msgOf(await fsApi.moreInfo(id, sv(v, "reason")), "Sent."))),
      });

    // ── work order wizard ────────────────────────────────────────────────
    type Wiz = { customerId?: string; siteId?: string; serviceTypeId?: string; scope?: string; priority?: string; assetId?: string; day?: string; h?: string; parts?: string[]; warrantyId?: string; key: string };
    const STEPS = ["Customer & site", "Problem / service", "Asset", "Schedule", "Technician requirements", "Parts / tools", "Checklist / proof", "Review & create"];
    const woWizard = (d0: Partial<Wiz> = {}, step = 0) => {
      const d: Wiz = { key: d0.key ?? newKey("wo_create"), ...d0 };
      const s = svc(d.serviceTypeId) ?? (opt?.services ?? []).find((x) => x.active);
      const tpl = opt?.templates.find((t) => t.id === s?.templateId);
      const fieldsBy: AField[][] = [
        [F("customerId", "Customer (CRM)", "select", { req: true, value: d.customerId ?? "", options: [{ v: "", t: "Choose…" }, ...cus()] }), F("siteId", "Site", "select", { value: d.siteId ?? "", options: [{ v: "", t: "Customer’s main site" }, ...siteOpts(d.customerId)] })],
        [F("serviceTypeId", "Service type", "select", { value: d.serviceTypeId ?? s?.id ?? "", options: svcOpts() }), F("scope", "Scope / issue", "area", { req: true, af: true, value: d.scope ?? "" }), F("priority", "Priority", "select", { value: d.priority ?? s?.priority ?? "Normal", options: prioOpts() })],
        [F("assetId", "Asset (Assets & Maintenance)", "select", { value: d.assetId ?? "", options: [{ v: "", t: "None" }, ...eqOpts(d.customerId)] })],
        [F("day", "Date", "select", { value: d.day ?? "", options: [{ v: "", t: "Schedule later (dispatch board)" }, ...dayOpts(14)] }), F("h", "Start time", "select", { value: d.h ?? "10", options: timeOpts() })],
        [F("req", "Requirements", "read", { value: `Skill: ${s?.skill ?? "—"}${s?.cert ? `\nCertification: ${s.cert}` : ""}\nEstimated duration: ${s?.durMin ?? "—"} min\nThe technician is chosen on the dispatch board with validation.` })],
        [F("parts", "Parts (from service template)", "checks", { options: [...new Set([...(s?.parts ?? []), ...(d.parts ?? [])])].map((p) => ({ v: p, t: pname(p), on: (d.parts ?? s?.parts ?? []).includes(p) })), help: "Listing parts does not move stock. Add more from the job’s Parts tab." })],
        [F("chk", "Checklist & proof", "read", { value: `Checklist: ${tpl ? `${tpl.name} v${tpl.version}` : "none published for this service type"}\nCustomer proof: ${s?.proof ?? "—"}` })],
        [F("sum", "Review", "read", { value: [`Customer: ${cname(d.customerId)}`, `Service: ${s?.name ?? "—"} · ${d.priority ?? "Normal"}`, `Asset: ${opt?.equipment.find((x) => x.id === d.assetId)?.name ?? "—"}`, `Schedule: ${d.day ? `${dayLabel(Number(d.day))} ${hh(Number(d.h ?? 10))}` : "Later"}`, `Parts: ${(d.parts ?? []).map(pname).join(", ") || "None"}`, `Scope: ${d.scope ?? ""}`].join("\n") })],
      ];
      modal({
        title: "New work order",
        sub: `${STEPS[step]} · step ${step + 1} of 8`,
        primaryT: step === 7 ? "Create work order" : "Next",
        cancel: step > 0 ? "Back" : "Cancel",
        back: step > 0 ? () => woWizard(d, step - 1) : undefined,
        fields: fieldsBy[step],
        onSubmit: async (v) => {
          const n = { ...d };
          if (step === 0) {
            n.customerId = sv(v, "customerId");
            n.siteId = sv(v, "siteId");
            const site = opt?.sites.find((x) => x.id === n.siteId);
            if (site && site.customerId !== n.customerId) return "That site belongs to another customer.";
          }
          if (step === 1) {
            n.serviceTypeId = sv(v, "serviceTypeId");
            n.scope = sv(v, "scope");
            n.priority = sv(v, "priority");
            if (!d0.parts) n.parts = svc(n.serviceTypeId)?.parts ?? [];
          }
          if (step === 2) n.assetId = sv(v, "assetId");
          if (step === 3) {
            n.day = sv(v, "day");
            n.h = sv(v, "h");
          }
          if (step === 5) n.parts = (v.parts as string[]) ?? [];
          if (step < 7) {
            woWizard(n, step + 1);
            return "keep";
          }
          const r = await fsApi.createWo({ customerId: n.customerId, siteId: n.siteId || null, assetId: n.assetId || null, serviceTypeId: n.serviceTypeId, scope: n.scope, priority: n.priority, day: n.day ? Number(n.day) : null, h: n.day ? Number(n.h) : null, parts: (n.parts ?? []).map((p) => ({ productId: p, qty: 1 })), warrantyId: n.warrantyId || null, key: n.key });
          await after(`${r.number} created (${r.status}) — ${r.status === "Open" ? "approve it to plan dispatch." : r.status === "Awaiting Approval" ? "waiting for a manager’s approval." : "assign it on the dispatch board."}`);
        },
      });
    };

    // ── dispatch ──────────────────────────────────────────────────────────
    const assignModal = async (id: string, day = 0, hour?: number) => {
      let sg: Awaited<ReturnType<typeof fsApi.suggest>>;
      try {
        sg = await fsApi.suggest(id, day, hour);
      } catch (e) {
        return flash(errText(e));
      }
      const w = opt?.wos.find((x) => x.id === id);
      const best = sg.list.find((x) => !x.blocks.length);
      modal({
        title: `${sg.tech ? "Reassign" : "Assign"} ${w?.number ?? ""}`,
        sub: "Technicians ranked for this slot — reasons shown, blockers stop the save.",
        primaryT: "Preview assignment",
        fields: [
          F("tech", "Technician (ranked, reasons shown)", "select", { req: true, value: best?.id ?? sg.tech ?? "", options: sg.list.map((x) => ({ v: x.id, t: `${x.name} — ${x.blocks.length ? `✕ ${x.blocks[0].split(" — ")[0]}` : `${x.score}/100${x.warns.length ? ` · ⚠ ${x.warns.length}` : ""}`}` })) }),
          F("day", "Date", "select", { value: String(day), options: dayOpts(14) }),
          F("h", "Start time", "select", { value: String(sg.h), options: timeOpts() }),
          ...(R?.approve ? [F("override", "Override blockers (manager)", "text", { ph: "Reason — leave blank to respect validation" })] : []),
        ],
        note: "Why ranked: skill fit, distance (zone estimate), workload, first-time fix and territory — the score is out of 100. Blockers (skill, certification, conflict, no shift) stop the save.",
        onSubmit: async (v) => {
          const b = { tech: sv(v, "tech"), day: Number(sv(v, "day")), h: Number(sv(v, "h")) };
          const pv = await fsApi.preview(id, b);
          if (pv.e.blocks.length && !sv(v, "override")) return pv.e.blocks.join(" · ");
          const ov = sv(v, "override");
          modal({
            title: `Assignment preview · ${w?.number ?? ""}`,
            sub: `${pv.name} · ${dayLabel(b.day)} ${pv.start}`,
            primaryT: "Confirm Assignment",
            cancel: "Back",
            back: () => void assignModal(id, b.day, b.h),
            fields: [
              F("pv", "Check", "read", {
                value: [`Technician: ${pv.name}`, `Start: ${pv.start} · ends ${pv.end}`, `Travel: ${pv.e.tr ?? "—"} min from ${pv.e.from ?? "—"} (zone estimate)`, `Score: ${pv.e.score}/100 (${pv.e.comps.map((c) => `${c[0]} ${c[1]}`).join(", ")})`, ...(ov ? pv.e.blocks.map((x) => `OVERRIDDEN: ${x}`) : []), ...(pv.e.warns.length ? pv.e.warns.map((x) => `⚠ ${x}`) : ["No conflicts"])].join("\n"),
              }),
            ],
            note: pv.e.warns.length || ov ? "Warnings don’t block, but are recorded in the audit with your name." : null,
            onSubmit: async () => {
              const r = await fsApi.assign(id, { ...b, override: ov || undefined, expected: pv.version });
              await after(r.approval ? (r.msg ?? "Sent for approval.") : `${w?.number ?? "Job"} assigned to ${pv.name}. Not yet dispatched — dispatch to notify the technician.${r.notice ? ` Customer: ${r.notice}.` : ""}`);
            },
          });
          return "keep";
        },
      });
    };
    const schedModal = (id: string) => {
      const w = opt?.wos.find((x) => x.id === id);
      modal({
        title: `Reschedule ${w?.number ?? ""}`,
        primaryT: "Reschedule",
        fields: [F("day", "New date", "select", { value: "0", options: dayOpts(14) }), F("h", "New time", "select", { value: "10", options: timeOpts() }), F("reason", "Reason", "text", { req: true, af: true }), F("notify", "Customer notification", "select", { options: O([["yes", "Yes — via Unified Inbox"], ["no", "No"]]) })],
        note: "Conflicts are validated against the technician’s day and shift.",
        onSubmit: async (v) => {
          const r = await fsApi.schedule(id, { day: Number(sv(v, "day")), h: Number(sv(v, "h")), reason: sv(v, "reason"), notify: sv(v, "notify") === "yes", expected: w?.version });
          await after(`${w?.number ?? "Job"} moved to ${r.label ?? ""}.${r.notice ? ` Customer: ${r.notice}.` : ""}`);
        },
      });
    };
    const prioModal = (id: string) =>
      modal({
        title: `Change priority · ${opt?.wos.find((x) => x.id === id)?.number ?? ""}`,
        primaryT: "Change priority",
        fields: [F("priority", "Priority", "select", { options: prioOpts() }), F("reason", "Reason", "text", { req: true, af: true })],
        note: "The SLA deadline is recalculated from the new priority’s policy.",
        onSubmit: async (v) => void (await after(msgOf(await fsApi.priority(id, { priority: sv(v, "priority"), reason: sv(v, "reason") }), "Priority changed."))),
      });
    const bulkModal = (k: string) => {
      const op = ({ "bk-assign": "assign", "bk-sched": "schedule", "bk-status": "status" } as const)[k as "bk-assign"];
      const ids = st.getState().sel;
      if (!ids.length) return flash("Select work orders first.");
      modal({
        title: `Bulk ${op} · ${ids.length} work orders`,
        sub: "Each one is validated individually; ineligible rows are skipped and listed.",
        primaryT: "Apply to eligible",
        fields: [
          ...(op === "assign" ? [F("tech", "Technician", "select", { options: (opt?.techs ?? []).filter((t) => t.active).map((t) => ({ v: t.id, t: t.name })) }), F("day", "Date (unscheduled jobs)", "select", { options: dayOpts(7) })] : op === "schedule" ? [F("day", "Date", "select", { options: dayOpts(14) })] : [F("st", "New status", "select", { options: O(["Approved", "Cancelled", "Closed"]) }), F("reason", "Reason", "text", { req: true })]),
          F("pv", "Affected", "read", { value: ids.map((i) => opt?.wos.find((w) => w.id === i)?.number ?? i).join(", ") }),
        ],
        onSubmit: async (v) => {
          const r = await fsApi.bulk({ ids, op, tech: sv(v, "tech") || undefined, day: sv(v, "day") ? Number(sv(v, "day")) : undefined, st: sv(v, "st") || undefined, reason: sv(v, "reason") || undefined });
          st.getState().set({ sel: [] });
          await after(`Applied to ${r.done.length}. Skipped ${r.skip.length}${r.skip.length ? `: ${r.skip.join("; ")}` : ""}.`);
        },
      });
    };

    // ── execution ─────────────────────────────────────────────────────────
    const techAct = async (act: string, id: string) => {
      const w = opt?.wos.find((x) => x.id === id);
      const T = async (a: string, label = a) => {
        try {
          const r = await sendOrQueue<{ msg?: string }>(label, w?.number ?? id, `/field-service/work-orders/${id}/tech`, { act: a }, true);
          await after(r ? msgOf(r, "Updated.") : "Saved on this device — Pending Sync. Server confirmation after reconnect.");
        } catch (e) {
          flash(errText(e));
        }
      };
      if (act === "open") return go("detail", id);
      if (["Accept", "Start travel", "Arrived", "Start job", "Resume"].includes(act)) return T(act);
      if (act === "Pause") return reason(`Pause ${w?.number ?? ""}`, "Why pause? (mention “part” or “customer” to set Awaiting Parts / Customer)", "Pause job", async (r) => msgOf(await sendOrQueue<{ msg?: string }>("Pause", w?.number ?? id, `/field-service/work-orders/${id}/tech`, { act: "Pause", reason: r }, true), "Saved on this device — Pending Sync."));
      if (act === "Navigate") {
        return void fsApi
          .drawer("wo", id, fsScopeOf(st.getState()))
          .then((dv) => {
            const site = dv.sections[0]?.kv?.find((x) => x.k === "Site")?.v ?? "";
            if (site && site !== "—") window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site)}`, "_blank", "noopener");
            else flash("No site address on this job.");
          })
          .catch((e) => flash(errText(e)));
      }
      if (act === "Call") {
        const ph = opt?.customers.find((c) => c.id === w?.customerId)?.phone;
        if (!ph) return flash(R?.pii ? "No phone on the customer record." : "PERMISSION_DENIED — customer phone needs “field.pii”.");
        window.location.assign(`tel:${ph.replace(/[^\d+]/g, "")}`);
        return;
      }
      if (act === "Scan") return scanModal(id);
      if (act === "Checklist") {
        st.getState().set({ view: { ...st.getState().view, wTab: "chk" } });
        return go("detail", id);
      }
      if (act === "Photo") return photoModal(id);
      if (act === "Use part") return partUseFirst(id);
      if (act === "Signature") return signModal(id);
      if (act === "Note") return reason(`Add note · ${w?.number ?? ""}`, "Note", "Add note", async (r) => msgOf(await sendOrQueue<{ msg?: string }>("Note", w?.number ?? id, `/field-service/work-orders/${id}/note`, { text: r }, true), "Saved on this device — Pending Sync."));
      if (act === "Help") return run(async () => msgOf(await fsApi.help(id), "Help requested."));
      if (act === "Complete work") return completeModal(id);
    };
    const scanModal = (id: string) =>
      modal({
        title: "Scan asset",
        sub: "Point the camera at the asset’s QR label or barcode, or type the code.",
        primaryT: "Check",
        fields: [F("cam", "Camera", "camera", { target: "code" }), F("code", "Code", "text", { req: true })],
        onSubmit: async (v) => {
          const dv = await fsApi.drawer("wo", id, fsScopeOf(st.getState()));
          const asset = dv.sections[0]?.kv?.find((x) => x.k === "Asset")?.v ?? "";
          const code = sv(v, "code").trim();
          const eq = opt?.equipment.find((x) => code.includes(x.id) || (x.serial && code === x.serial) || code === x.number);
          const ok = eq && asset.includes(eq.name);
          await sendOrQueue("Scan", id, `/field-service/work-orders/${id}/note`, { text: `Asset scan: ${code} — ${ok ? `matches ${eq.name}` : eq ? `is ${eq.number} (${eq.name}), not the job’s asset` : "not found in Assets"}` }, true);
          await after(ok ? `Scanned ${code} — matches ${eq.name}.` : eq ? `⚠ ${eq.number} isn’t this job’s asset (${asset}). Logged on the job.` : "Code not found in Assets & Maintenance — logged as a note.");
        },
      });
    const photoModal = (id: string) =>
      modal({
        title: `Upload photo · ${opt?.wos.find((x) => x.id === id)?.number ?? ""}`,
        primaryT: "Upload",
        fields: [F("stage", "Stage", "select", { options: O([["before", "Before"], ["during", "During"], ["after", "After"], ["evidence", "Evidence"]]) }), F("file", "Photo", "file", { req: true, accept: "image/*" })],
        note: navigator.onLine ? "Stored privately on the job; downloads use signed links." : "You’re offline — photos upload when the device is connected.",
        onSubmit: async (v) => void (await after(msgOf(await fsApi.photo(id, sv(v, "stage"), v.file as File), "Photo stored on the job."))),
      });
    const signModal = (id: string) => {
      const w = opt?.wos.find((x) => x.id === id);
      modal({
        title: `Customer signature · ${w?.number ?? ""}`,
        sub: cname(w?.customerId),
        primaryT: "Capture signature",
        fields: [F("name", "Customer name", "text", { req: true, af: true, value: cname(w?.customerId) === "—" ? "" : cname(w?.customerId) }), F("ack", "Acknowledgement", "select", { req: true, options: O([["", "Choose…"], ["yes", "Customer confirms the work was performed as described"]]) }), F("note", "Customer notes", "text")],
        note: "A signature is evidence of service — it is NOT payment confirmation.",
        onSubmit: async (v) => {
          if (sv(v, "ack") !== "yes") return "Name and acknowledgement are required.";
          const r = await sendOrQueue<{ msg?: string }>("Customer signature", w?.number ?? id, `/field-service/work-orders/${id}/sign`, { name: sv(v, "name"), ack: true, note: sv(v, "note") || undefined }, true);
          await after(r ? "Signature captured. This is service evidence, not payment." : "Saved on this device — Pending Sync.");
        },
      });
    };
    const completeModal = (id: string) => {
      const w = opt?.wos.find((x) => x.id === id);
      modal({
        title: `Complete ${w?.number ?? ""}`,
        sub: "The server checks every requirement (checklist, after photo, parts accounted, labor, signature, resolution).",
        primaryT: "Complete job",
        fields: [F("resolution", "Resolution", "area", { req: true, af: true }), F("fixed", "Outcome", "select", { options: O([["fixed", "Resolved"], ["unresolved", "Not resolved — follow-up needed"]]) }), F("why", "Failure reason (if unresolved)", "text")],
        onSubmit: async (v) => {
          const r = await sendOrQueue<{ msg?: string }>("Complete job", w?.number ?? id, `/field-service/work-orders/${id}/complete`, { resolution: sv(v, "resolution"), fixed: sv(v, "fixed") !== "unresolved", why: sv(v, "why") || undefined }, true);
          await after(r ? msgOf(r, "Completed.") : "Saved on this device — Pending Sync.");
        },
      });
    };

    // ── parts ─────────────────────────────────────────────────────────────
    const addPartModal = (id: string) =>
      modal({
        title: `Add part to ${opt?.wos.find((x) => x.id === id)?.number ?? ""}`,
        primaryT: "Add requirement",
        fields: [F("productId", "Part (Inventory product)", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...(opt?.products ?? []).map((p) => ({ v: p.id, t: `${p.name}${p.sku ? ` · ${p.sku}` : ""} · ${p.stock} in stock` }))] }), F("qty", "Quantity", "number", { value: "1", req: true })],
        note: "Adds a requirement only — stock doesn’t move until it is issued from Inventory.",
        onSubmit: async (v) => void (await after(msgOf(await fsApi.addPart(id, { productId: sv(v, "productId"), qty: Number(sv(v, "qty")) }), "Part added."))),
      });
    const partQty = (id: string, partId: string, mode: "use" | "return", name = "Part") =>
      modal({
        title: `${mode === "use" ? "Use" : "Return"} part · ${name}`,
        primaryT: mode === "use" ? "Record use" : "Return to stock",
        fields: [F("qty", "Quantity", "number", { value: "1", req: true }), F("reason", "Reason", "text", { value: mode === "use" ? "Installed on site" : "Not needed" }), ...(mode === "use" ? [F("serial", "Serial / batch", "text")] : [])],
        note: mode === "use" ? "Stock already left Inventory when the part was issued." : "Inventory adds the quantity back and reverses its cost.",
        onSubmit: async (v) => {
          const b = { qty: Number(sv(v, "qty")), reason: sv(v, "reason") || undefined, serial: sv(v, "serial") || undefined, key: newKey(`part_${mode}`) };
          const r = mode === "use" ? await fsApi.usePart(id, partId, b) : await fsApi.returnPart(id, partId, b);
          await after(msgOf(r, "Done."));
        },
      });
    const partUseFirst = (id: string) =>
      void fsApi
        .drawer("wo", id, fsScopeOf(st.getState()))
        .then((dv) => {
          const p = (dv.ref?.parts ?? []).find((x) => x.left > 0);
          if (!p) return flash("No issued parts on this job. Ask the store to issue first.");
          partQty(id, p.id, "use", p.name);
        })
        .catch((e) => flash(errText(e)));
    const procureModal = (id: string, partId: string) =>
      modal({
        title: "Create procurement request",
        sub: "Creates a draft purchase order in Inventory for the shortage.",
        primaryT: "Create purchase order",
        fields: [F("supplierId", "Supplier", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...(opt?.suppliers ?? []).map((x) => ({ v: x.id, t: x.name }))] })],
        onSubmit: async (v) => void (await after(msgOf(await fsApi.procure(id, partId, sv(v, "supplierId")), "Purchase order drafted."))),
      });

    // ── labor ─────────────────────────────────────────────────────────────
    const laborModal = (d: { id?: string; woId?: string; tech?: string; type?: string } = {}) =>
      modal({
        title: d.id ? "Edit labor entry" : "Add manual time",
        primaryT: "Save entry",
        fields: [
          F("tech", "Technician", "select", { value: d.tech ?? (opt?.me.techOnly ? opt.me.id : (opt?.techs[0]?.id ?? "")), options: (opt?.techs ?? []).filter((t) => !opt?.me.techOnly || t.id === opt.me.id).map((t) => ({ v: t.id, t: t.name })) }),
          F("woId", "Work order", "select", { req: true, value: d.woId ?? "", options: [{ v: "", t: "Choose…" }, ...(opt?.wos ?? []).filter((w) => !opt?.me.techOnly || w.techUserId === opt.me.id).map((w) => ({ v: w.id, t: `${w.number} · ${cname(w.customerId)}` }))] }),
          F("type", "Labor type", "select", { value: d.type ?? "Repair", options: O(LABOR) }),
          F("day", "Date", "select", { value: "0", options: [{ v: "-2", t: dayLabel(-2) }, { v: "-1", t: "Yesterday" }, { v: "0", t: "Today" }] }),
          F("s", "Start", "select", { value: "9", options: timeOpts() }),
          F("e", "End", "select", { value: "10", options: timeOpts() }),
          F("brk", "Break (min)", "number", { value: "0" }),
          F("billable", "Billable", "select", { options: O([["yes", "Billable"], ["no", "Non-billable"]]) }),
          F("reason", "Reason for manual entry", "text", { req: !!opt?.cfg.labor.manualReason }),
        ],
        note: `Durations round to ${opt?.cfg.labor.roundMin ?? 15} min. ${opt?.cfg.labor.overlap ? "" : "Overlapping entries are blocked."}`,
        onSubmit: async (v) => {
          const b = { tech: sv(v, "tech"), woId: sv(v, "woId"), type: sv(v, "type"), day: Number(sv(v, "day")), s: Number(sv(v, "s")), e: Number(sv(v, "e")), brk: Number(sv(v, "brk") || 0), billable: sv(v, "billable") !== "no", reason: sv(v, "reason") || undefined };
          const r = d.id ? await fsApi.editLabor(d.id, b) : await fsApi.addLabor(b);
          await after(msgOf(r, "Saved as Draft."));
        },
      });

    // ── plans / templates ─────────────────────────────────────────────────
    const planModal = async (id: string | null, d: { customerId?: string; assetId?: string } = {}) => {
      let p: Record<string, unknown> | null = null;
      if (id) {
        const dv = await fsApi.drawer("plan", id, fsScopeOf(st.getState())).catch((e: unknown) => (flash(errText(e)), null));
        if (!dv) return;
        p = dv.ref ?? {};
      }
      const pv = (k: string, dflt = "") => (p && p[k] != null ? String(p[k]) : dflt);
      const cId = d.customerId ?? pv("customerId");
      modal({
        title: id ? `Edit ${pv("name", "plan")}` : "New preventive plan",
        sub: id ? "Saving recalculates the next due date from today." : undefined,
        primaryT: "Save plan",
        wide: true,
        fields: [
          F("name", "Plan name", "text", { req: true, af: true, value: pv("name") }),
          F("customerId", "Customer", "select", { req: true, value: cId, options: [{ v: "", t: "Choose…" }, ...cus()] }),
          F("assetId", "Asset", "select", { value: d.assetId ?? pv("assetId"), options: [{ v: "", t: "Site-wide" }, ...eqOpts(cId || undefined)] }),
          F("serviceTypeId", "Service type", "select", { req: true, value: pv("serviceTypeId"), options: svcOpts() }),
          F("trigger", "Trigger", "select", { value: pv("trigger", "Monthly"), options: O(["Every X days", "Weekly", "Monthly", "Quarterly", "Annually", "Usage hours"]) }),
          F("freq", "Frequency (days, or meter units for usage)", "number", { value: pv("freq", "30"), req: true }),
          F("firstDueDays", "First due in (days)", "number", { value: pv("firstDueDays", "7") }),
          F("window", "Preferred window", "text", { value: pv("window", "Any") }),
          F("autoCreate", "Auto-create WO", "select", { value: p ? (p.autoCreate ? "yes" : "no") : "yes", options: O([["yes", "Yes"], ["no", "No"]]) }),
          F("approval", "Approval before scheduling", "select", { value: p?.approval ? "yes" : "no", options: O([["no", "No"], ["yes", "Yes"]]) }),
        ],
        onSubmit: async (v) => {
          const r = await fsApi.savePlan(id, { name: sv(v, "name"), customerId: sv(v, "customerId"), assetId: sv(v, "assetId") || null, serviceTypeId: sv(v, "serviceTypeId"), trigger: sv(v, "trigger"), freq: Number(sv(v, "freq")), firstDueDays: Number(sv(v, "firstDueDays") || 0), window: sv(v, "window"), autoCreate: sv(v, "autoCreate") === "yes", approval: sv(v, "approval") === "yes" });
          await after(msgOf(r, "Plan saved."));
        },
      });
    };
    const templateModal = () =>
      modal({
        title: "New checklist template",
        primaryT: "Save draft",
        wide: true,
        fields: [
          F("name", "Name", "text", { req: true, af: true }),
          F("serviceTypeId", "Service type", "select", { options: [{ v: "", t: "Any" }, ...svcOpts()] }),
          F("assetType", "Asset type", "text", { value: "Any" }),
          F("items", "Items — one per line: text | type | required(y/n)", "area", { rows: 6, req: true, value: "Isolate power | Yes/No | y\nReading | Measurement | y\nAfter photo | Photo | y" }),
        ],
        note: "Types: Yes/No, Pass/Fail, Text, Number, Measurement, Photo, Video, Signature, Barcode / QR, Asset field, Select, Multi-select, Date/time.",
        onSubmit: async (v) => void (await after(msgOf(await fsApi.addTemplate({ name: sv(v, "name"), serviceTypeId: sv(v, "serviceTypeId") || null, assetType: sv(v, "assetType"), items: sv(v, "items") }), "Template drafted."))),
      });

    // ── agreements & warranty ─────────────────────────────────────────────
    const agreementModal = async (id: string | null) => {
      const g = id ? ((await fsApi.drawer("agr", id, fsScopeOf(st.getState())).catch((e: unknown) => (flash(errText(e)), null)))?.ref ?? null) : null;
      if (id && !g) return;
      const gv = (k: string, dflt = "") => (g && g[k] != null ? String(g[k]) : dflt);
      const ga = (k: string) => (g && Array.isArray(g[k]) ? (g[k] as string[]) : []);
      modal({
        title: id ? "Edit agreement" : "New service agreement",
        sub: "Entitlements only — legal text and signatures stay in Contracts. Link the signed contract that backs it.",
        primaryT: id ? "Save agreement" : "Create agreement",
        wide: true,
        fields: [
          F("customerId", "Customer", "select", { req: true, value: gv("customerId"), options: [{ v: "", t: "Choose…" }, ...cus()] }),
          F("contractId", "Signed contract (Contracts)", "select", { value: gv("contractId"), options: [{ v: "", t: "Not linked" }, ...(opt?.contracts ?? []).map((c) => ({ v: c.id, t: `${c.number} · ${c.title} · ${cname(c.customerId)} · ${c.status}` }))], help: "Must be a contract with the same customer." }),
          F("startOn", "Start", "date", { value: gv("startOn", today()), req: true }),
          F("endOn", "End", "date", { value: gv("endOn", plusYear()), req: true }),
          F("serviceTypeIds", "Covered services", "checks", { options: (opt?.services ?? []).filter((s) => s.active).map((s) => ({ v: s.id, t: s.name, on: ga("serviceTypeIds").includes(s.id) })) }),
          F("assetIds", "Covered assets (customer equipment; none = site-wide)", "checks", { options: (opt?.equipment ?? []).map((x) => ({ v: x.id, t: `${x.number} · ${x.name} · ${cname(x.customerId)}`, on: ga("assetIds").includes(x.id) })) }),
          F("visits", "Included visits", "number", { value: gv("visits", "4"), req: true }),
          F("freq", "Visit frequency", "select", { value: gv("freq", "Monthly"), options: O(["Monthly", "Bi-monthly", "Quarterly", "Half-yearly", "Annually", "On call"]) }),
          F("respH", "Response SLA (h)", "number", { value: gv("respH", "8"), req: true }),
          F("resH", "Resolution SLA (h)", "number", { value: gv("resH", "48"), req: true }),
          F("labor", "Labor", "text", { value: gv("labor", "Included") }),
          F("parts", "Parts", "text", { value: gv("parts", "Excluded") }),
          F("renewal", "Renewal", "select", { value: gv("renewal", "Manual"), options: O(["Manual", "Auto-renew"]) }),
        ],
        note: "“Included” labor or parts are invoiced at zero on covered jobs; anything else is charged.",
        onSubmit: async (v) => {
          const r = await fsApi.saveAgreement(id, { customerId: sv(v, "customerId"), contractId: sv(v, "contractId") || null, startOn: sv(v, "startOn"), endOn: sv(v, "endOn"), serviceTypeIds: (v.serviceTypeIds as string[]) ?? [], assetIds: (v.assetIds as string[]) ?? [], visits: Number(sv(v, "visits")), freq: sv(v, "freq"), respH: Number(sv(v, "respH")), resH: Number(sv(v, "resH")), labor: sv(v, "labor"), parts: sv(v, "parts"), renewal: sv(v, "renewal") });
          await after(msgOf(r, "Saved."));
        },
      });
    };
    const caseModal = (d: { customerId?: string; assetId?: string } = {}) =>
      modal({
        title: "Open warranty case",
        primaryT: "Open case",
        fields: [
          F("assetId", "Asset (customer equipment)", "select", { req: true, value: d.assetId ?? "", options: [{ v: "", t: "Choose…" }, ...eqOpts()] }),
          F("issue", "Issue", "area", { req: true, af: true }),
          F("source", "Warranty source (blank = from the asset record)", "text"),
        ],
        onSubmit: async (v) => {
          const eq = opt?.equipment.find((x) => x.id === sv(v, "assetId"));
          if (!eq?.customerId) return "That asset has no customer on its Assets record.";
          await after(msgOf(await fsApi.openCase({ customerId: eq.customerId, assetId: eq.id, issue: sv(v, "issue"), source: sv(v, "source") || undefined }), "Case opened."));
        },
      });
    const wrnRejectModal = (id: string) =>
      modal({
        title: "Reject warranty case",
        primaryT: "Reject",
        pBg: "#B42318",
        fields: [
          F("reason", "Reason", "select", { options: O(["Outside warranty period", "Excluded failure type", "Physical damage / misuse", "Serial not verifiable", "Other"]) }),
          F("ev", "Evidence reference", "text", { req: true, value: "Asset record + inspection photos" }),
          F("cust", "Customer-facing explanation", "area", { req: true }),
          F("int", "Internal note", "text"),
          F("follow", "Follow-up", "select", { options: O([["", "None"], ["quote", "Offer chargeable repair (work order + quote in Orders)"]]) }),
        ],
        onSubmit: async (v) => void (await after(msgOf(await fsApi.rejectWrn(id, { reason: sv(v, "reason"), ev: sv(v, "ev"), cust: sv(v, "cust"), int: sv(v, "int") || undefined, follow: sv(v, "follow") || undefined }), "Rejected."))),
      });
    const wrnAction = (id: string, a: string) => {
      if (a === "Open") return open("wrn", id);
      if (a === "View asset") return open("wrnasset", id);
      if (a === "Validate") return run(async () => msgOf(await fsApi.wrn(id, "validate"), "Validated."));
      if (a === "Request evidence") return run(async () => msgOf(await fsApi.wrn(id, "request-evidence"), "Requested."));
      if (a === "Attach evidence") return modal({ title: "Attach evidence", primaryT: "Attach", fields: [F("file", "File", "file", { req: true, accept: "image/*,application/pdf" })], onSubmit: async (v) => void (await after(msgOf(await fsApi.evidence(id, v.file as File), "Attached."))) });
      if (a === "Approve") return reason("Approve warranty exception", "Approval reason", "Approve", async (r) => msgOf(await fsApi.approveWrn(id, r), "Approved."));
      if (a === "Reject") return wrnRejectModal(id);
      if (a === "Close case") return run(async () => msgOf(await fsApi.wrn(id, "close"), "Closed."));
    };

    // ── work order actions ────────────────────────────────────────────────
    const woAction = (id: string, a: string) => {
      const w = opt?.wos.find((x) => x.id === id);
      if (a === "Open" || a === "more") return open("wo", id);
      if (["Open work order", "Open job", "full"].includes(a)) return go("detail", id);
      if (a === "Approve") return run(async () => `${msgOf(await fsApi.approve(id), "")}${w?.number ?? "Job"} approved.`);
      if (a === "Submit") return run(async () => (await fsApi.submit(id), `${w?.number ?? "Job"} submitted (Open).`));
      if (["Assign", "Reassign", "Assign nearest suitable"].includes(a)) return void assignModal(id);
      if (a === "Schedule" || a === "Reschedule") return schedModal(id);
      if (a === "Dispatch") return run(async () => { const r = await fsApi.dispatch(id); return `${r.tech ?? "Technician"} notified — job is Dispatched.${r.notice ? ` Customer: ${r.notice}.` : ""}`; });
      if (a === "Change priority") return prioModal(id);
      if (a === "Cancel") return reason(`Cancel ${w?.number ?? ""}?`, "Cancellation reason", "Cancel work order", async (r) => { const x = await fsApi.cancel(id, r); return x.approval ? (x.msg ?? "Sent for approval.") : `${w?.number ?? "Job"} cancelled — reservations released.`; }, { danger: true, sub: "Reserved parts are released. Issued parts must be returned first." });
      if (a === "Duplicate")
        return void fsApi
          .drawer("wo", id, fsScopeOf(st.getState()))
          .then((dv) => {
            const r = dv.ref ?? {};
            woWizard({ customerId: r.customerId as string, siteId: (r.siteId as string) ?? undefined, assetId: (r.assetId as string) ?? undefined, serviceTypeId: r.serviceTypeId as string, scope: r.scope as string, priority: r.priority as string, parts: (r.parts ?? []).map((p) => p.productId) });
          })
          .catch((e) => flash(errText(e)));
      if (["Start travel", "Arrived", "Start job", "Resume", "Complete work", "Pause"].includes(a)) return void techAct(a, id);
      if (a === "Close") return run(async () => (await fsApi.close(id), `${w?.number ?? "Job"} closed.`));
      if (a === "Reopen") return reason(`Reopen ${w?.number ?? ""}`, "Why reopen?", "Reopen", async (r) => { const x = await fsApi.reopen(id, r); return x.approval ? (x.msg ?? "Sent for approval.") : `${w?.number ?? "Job"} reopened (counts as a repeat visit).`; });
      if (a === "Add part") return addPartModal(id);
      if (a === "Add labor") return laborModal({ woId: id, tech: w?.techUserId ?? undefined });
      if (a === "Upload photo") return photoModal(id);
      if (a === "Capture signature") return signModal(id);
      if (a === "report") return open("report", id);
      if (a === "Request quote") return run(async () => msgOf(await fsApi.quote(id), "Quote drafted."));
      if (a === "Request invoice") return run(async () => msgOf(await fsApi.invoice(id), "Invoice issued."));
      if (a === "Payment link") return run(async () => msgOf(await fsApi.payLink(id), "Payment link sent."));
      if (a === "Notify customer" || a === "notify") return run(async () => msgOf(await fsApi.notify(id), "Customer notified."));
    };

    // ── top-level buttons ─────────────────────────────────────────────────
    const exportModal = () =>
      modal({
        title: "Export",
        sub: "Respects your field permissions — phone numbers, costs and rates are omitted when your role can’t see them.",
        primaryT: "Download",
        fields: [F("what", "Data", "select", { value: st.getState().tab === "labor" ? "labor" : st.getState().tab === "requests" ? "requests" : st.getState().tab === "parts" ? "parts" : "workorders", options: O([["workorders", "Work orders (current filters)"], ["requests", "Service requests"], ["labor", "Labor entries"], ["parts", "Part lines"]]) }), F("format", "Format", "select", { options: O([["csv", "CSV"], ["xlsx", "XLSX"]]) }), F("scope", "Rows", "select", { options: O([["view", "Current view"], ["sel", `Selected (${st.getState().sel.length})`]]) })],
        onSubmit: async (v) => {
          const n = await fsDownload(sv(v, "what"), sv(v, "format"), fsScopeOf(st.getState()), sv(v, "scope") === "sel" ? st.getState().sel : []);
          flash(`Exported ${n} rows.`);
        },
      });
    const top = (k: string) => {
      const s = st.getState();
      if (k === "newreq") return R?.request ? requestModal() : flash("PERMISSION_DENIED");
      if (k === "newwo") return R?.workorder ? woWizard() : flash("PERMISSION_DENIED");
      if (k === "export") return R?.export ? exportModal() : flash("PERMISSION_DENIED — field.export not granted.");
      if (k === "audit") return open("audit", "_");
      if (k === "approvals") return open("approvals", "_");
      if (k === "newtpl") return templateModal();
      if (k === "lab-new") return laborModal();
      if (k === "pm-new") return void planModal(null);
      if (k === "agr-new") return void agreementModal(null);
      if (k === "wrn-new") return caseModal();
      if (k === "dsp-opt") return open("opt", "_");
      if (k === "dsp-lock")
        return run(async () => {
          const cached = qc.getQueriesData<FsScreen>({ queryKey: ["fs", "screen"] }).map(([, x]) => x).find(Boolean);
          const on = !cached?.head.lock;
          await fsApi.lock(on);
          return on ? "Dispatch locked — only managers can change assignments." : "Dispatch unlocked.";
        });
      if (k === "refresh") return void after("Re-synced work orders, Staff shifts, Inventory stock and check-ins.");
      if (k === "sync") return void syncQueue().then((r) => after(`Synced ${r.synced}${r.failed ? ` · ${r.failed} failed (see queue)` : ""}.`));
      if (k.startsWith("bk-")) return bulkModal(k);
      if (k.startsWith("go:")) return go(k.slice(3));
      if (k === "ext:customers") return router.push("/customers");
      if (k === "ext:staff") return router.push("/staff");
      if (k === "ext:assets") return router.push("/assets-maintenance/assets");
      if (k.startsWith("ext:asset:")) return router.push(`/assets-maintenance/assets/${k.slice(10)}`);
      if (k.startsWith("clear:")) {
        const b = k.slice(6);
        return st.getState().set({ f: { ...s.f, [b]: {} }, page: {} });
      }
      if (k.startsWith("w:")) {
        const a = k.slice(2);
        return woAction(s.cur, { Assign: "Assign", "Payment link": "Payment link" }[a] ?? a);
      }
      if (k.startsWith("tw:")) {
        const [, a, id] = k.split(":");
        return void techAct(a, id);
      }
      if (k.startsWith("tw-st:")) {
        const uid = opt?.me.techOnly ? opt.me.id : s.techView || opt?.techs[0]?.id || opt?.me.id || "";
        return run(async () => (await fsApi.techStatus(uid, k.slice(6)), k.slice(6) ? `Status: ${k.slice(6)}.` : "Back on duty — status follows jobs and shifts."));
      }
    };

    const kpiClick = (k: string) => {
      const [p, x] = k.split(":");
      const M: Record<string, [string, Record<string, string>, string]> = {
        req: ["requests", {}, "req"],
        unas: ["workorders", { st: "unassigned" }, "wo"],
        today: ["workorders", { day: "today" }, "wo"],
        act: ["map", {}, "map"],
        sla: ["workorders", { sla: "At Risk" }, "wo"],
        parts: ["parts", { st: "Missing" }, "pt"],
        sig: ["workorders", { st: "In Progress" }, "wo"],
        done: ["workorders", { st: "Completed" }, "wo"],
        over: ["workorders", { sla: "Breached" }, "wo"],
      };
      if (p === "o" && M[x]) return go(M[x][0], undefined, M[x][1], M[x][2]);
      if (p === "r") return x === "tt" ? open("kpi", k) : go("requests", undefined, x === "urg" ? { prio: "Urgent" } : { st: x }, "req");
      if (p === "w") return go("workorders", undefined, x === "open" ? { st: "open" } : x === "unassigned" ? { st: "unassigned" } : x === "Breached" ? { sla: "Breached" } : { st: x }, "wo");
      if (p === "p") return go("parts", undefined, ["Reserved", "Issued", "Missing", "Used"].includes(x) ? { st: x } : {}, "pt");
      if (p === "l") return go("labor", undefined, x === "Submitted" ? { apr: "Submitted" } : {}, "lab");
      if (p === "wt") return st.getState().set({ view: { ...st.getState().view, wTab: x } });
      if (p === "tw") return;
      if (p === "e" && x === "w") return st.getState().set({ f: { ...st.getState().f, eq: { w: "in" } } });
      return open("kpi", k);
    };

    // ── row actions ───────────────────────────────────────────────────────
    const rowAction = (b: string, id: string, a: string) => {
      if (b === "ov-att") {
        const [kind, ref] = id.split(":");
        if (kind === "apr") return a === "Approve" ? run(async () => msgOf(await fsApi.decide(ref, true), "Approved.")) : reason("Reject request", "Reason", "Reject", async (r) => msgOf(await fsApi.decide(ref, false, r), "Rejected."), { danger: true });
        if (a === "Open parts") return go("parts");
        if (a === "Review") return go("detail", ref);
        return woAction(ref, a === "Reschedule" ? "Reschedule" : a);
      }
      if (["ov-today", "wo", "map-j", "cal", "w-hist"].includes(b)) return woAction(id, a);
      if (["ov-cap", "map-t", "dsp-l", "tw-who"].includes(b)) {
        if (a === "Open technician" || a === "Open" || a === "View route") return open("tech", id);
        if (a === "Contact technician" || a === "Notify technician") return reason("Message technician", "Message", "Send", async (r) => msgOf(await fsApi.messageTech(id, r), "Sent."), { sub: "Delivered as an in-app notification." });
        if (a.startsWith("Dispatch ")) {
          const n = a.slice(9);
          const w = opt?.wos.find((x) => x.number === n);
          if (w) return woAction(w.id, "Dispatch");
        }
        return;
      }
      if (b === "dsp-q") return a === "Suggest technician" ? open("opt", "_") : woAction(id, a === "Assign" ? "Assign" : "Open");
      if (b === "req") {
        if (a === "Open") return open("req", id);
        return void fsApi
          .drawer("req", id, fsScopeOf(st.getState()))
          .then((dv) => {
            const number = String(dv.ref?.number ?? "");
            const issue = String(dv.ref?.issue ?? "");
            if (a === "Triage") return triageModal(id, number, issue);
            if (a === "Convert to work order") return convertModal(id, number, issue, String(dv.ref?.priority ?? "Normal"), String(dv.ref?.preview ?? ""));
            if (a === "Request more information") return moreInfoModal(id, number);
            if (a === "Reject") return rejectModal(id, number);
            if (a === "Send to Helpdesk") return run(async () => msgOf(await fsApi.helpdesk(id), "Sent."));
          })
          .catch((e) => flash(errText(e)));
      }
      if (b === "w-chk") {
        const [wid, i] = split(id);
        const idx = Number(i);
        if (a === "Record value") return modal({ title: "Record value", primaryT: "Save", fields: [F("value", "Value / reading", "text", { req: true, af: true }), F("note", "Comment", "text")], onSubmit: async (v) => void (await after(msgOf(await sendOrQueue<{ msg?: string }>("Checklist item", wid, `/field-service/work-orders/${wid}/checklist`, { index: idx, value: sv(v, "value"), note: sv(v, "note") || undefined }, true), "Saved on this device — Pending Sync."))) });
        return run(async () => msgOf(await sendOrQueue<{ msg?: string }>("Checklist item", wid, `/field-service/work-orders/${wid}/checklist`, { index: idx, value: a }, true), "Saved on this device — Pending Sync."));
      }
      if (["w-parts", "pt"].includes(b)) {
        const [wid, pid] = split(id);
        if (a === "View inventory") return router.push("/inventory");
        if (a === "Reserve") return run(async () => msgOf(await fsApi.partAct(wid, pid!, "reserve"), "Reserved."));
        if (a === "Issue") return run(async () => msgOf(await fsApi.partAct(wid, pid!, "issue"), "Issued."));
        if (a === "Use") return partQty(wid, pid!, "use");
        if (a === "Return") return partQty(wid, pid!, "return");
        if (a === "Create procurement request") return procureModal(wid, pid!);
      }
      if (b === "w-files" && a === "Download") return run(async () => { const r = await fsApi.fileUrl(id); window.open(r.url, "_blank", "noopener"); return `Opening ${r.name}.`; });
      if (b === "lab") {
        if (a === "Edit") return laborModal({ id });
        if (a === "Reject") return reason("Reject labor entry", "Reason", "Reject", async (r) => msgOf(await fsApi.laborAct(id, "Reject", r), "Rejected."), { danger: true });
        return run(async () => msgOf(await fsApi.laborAct(id, a), "Updated."));
      }
      if (b === "eq") {
        const x = opt?.equipment.find((e) => e.id === id);
        if (a === "Open") return open("asset", id);
        if (a === "Open in Assets") return router.push(`/assets-maintenance/assets/${id}`);
        if (a === "Create service request") return requestModal({ assetId: id });
        if (a === "Create work order") return woWizard({ customerId: x?.customerId ?? undefined, assetId: id, siteId: x?.siteId ?? undefined });
        if (a === "Schedule maintenance") return void planModal(null, { customerId: x?.customerId ?? undefined, assetId: id });
        if (a === "Set site")
          return modal({
            title: `Install site · ${x?.number ?? ""}`,
            primaryT: "Save",
            fields: [F("siteId", "Site", "select", { value: x?.siteId ?? "", options: [{ v: "", t: "New site below" }, ...siteOpts(x?.customerId ?? undefined)] }), F("address", "New site address", "text"), F("zone", "Territory", "select", { options: [{ v: "", t: "—" }, ...zoneOpts()] })],
            onSubmit: async (v) => {
              let siteId = sv(v, "siteId");
              if (!siteId) {
                if (!x?.customerId) return "This asset has no customer on its Assets record.";
                await fsApi.saveSite(null, { customerId: x.customerId, address: sv(v, "address"), zone: sv(v, "zone") });
                const o = await qc.fetchQuery({ queryKey: ["fs", "options", "fresh"], queryFn: fsApi.options, staleTime: 0 });
                siteId = o.sites.filter((s) => s.customerId === x.customerId && s.address === sv(v, "address")).pop()?.id ?? "";
                if (!siteId) return "Site not saved.";
              }
              await after(msgOf(await fsApi.equipmentSite(id, siteId), "Saved."));
            },
          });
      }
      if (b === "pm") {
        if (a === "Open" || a === "View history") return open("plan", id);
        if (a === "Edit") return void planModal(id);
        if (a === "Pause" || a === "Resume") return run(async () => msgOf(await fsApi.planStatus(id, a === "Resume"), "Updated."));
        if (a === "Generate WO") return run(async () => msgOf(await fsApi.generate(id), "Generated."));
      }
      if (b === "agr") {
        if (a === "View entitlement") return open("agr", id);
        if (a === "Schedule visits") return go("pm");
        if (a === "Edit") return void agreementModal(id);
        if (a === "Suspend" || a === "Resume") return reason(`${a} agreement`, "Reason", a, async (r) => msgOf(await fsApi.agreementStatus(id, a === "Suspend", r), "Updated."), { danger: a === "Suspend" });
        if (a === "Open contract")
          return void fsApi
            .drawer("agr", id, fsScopeOf(st.getState()))
            .then((r) => {
              const n = (r.ref as { contractNumber?: string | null } | undefined)?.contractNumber;
              router.push(n ? `/contracts/${encodeURIComponent(n)}` : "/contracts/all");
            })
            .catch((e: unknown) => flash(errText(e)));
      }
      if (b === "wrn") {
        if (a === "Create work order") return caseWo(id);
        return wrnAction(id, a);
      }
      if (b === "ins") {
        if (a === "Open" || a === "Review") return open("ins", id);
        if (a === "Resume")
          return void fsApi
            .drawer("ins", id, fsScopeOf(st.getState()))
            .then((dv) => go("detail", String(dv.ref?.woId ?? "")))
            .catch((e) => flash(errText(e)));
        if (a === "Approve") return run(async () => msgOf(await fsApi.approveIns(id), "Approved."));
        if (a === "Create follow-up") return followUp(id);
      }
      if (b === "tpl") {
        if (a === "Open") return open("tpl", id);
        if (a === "Publish version") return confirm("Publish this version?", "New work orders for its service type will use it. Existing jobs and past inspections keep the version they started with.", "Publish", async () => msgOf(await fsApi.templateAct(id, a), "Published."));
        return run(async () => msgOf(await fsApi.templateAct(id, a), "Done."));
      }
      if (b === "tw-list") return go("detail", id);
    };
    const followUp = (insId: string) =>
      void fsApi
        .drawer("ins", insId, fsScopeOf(st.getState()))
        .then((dv) => {
          const r = dv.ref ?? {};
          woWizard({ customerId: (r.customerId as string) ?? undefined, siteId: (r.siteId as string) ?? undefined, assetId: (r.assetId as string) ?? undefined, serviceTypeId: (r.serviceTypeId as string) ?? undefined, scope: `Follow-up from ${String(r.number ?? "inspection")} (failed checklist items)`, priority: "Normal" }, r.customerId ? 1 : 0);
        })
        .catch((e) => flash(errText(e)));
    const caseWo = (wrnId: string) =>
      void fsApi
        .drawer("wrn", wrnId, fsScopeOf(st.getState()))
        .then((dv) => {
          const r = dv.ref ?? {};
          woWizard({ warrantyId: wrnId, customerId: r.customerId as string, assetId: r.assetId as string, siteId: (r.siteId as string) ?? undefined, scope: `Warranty repair · ${String(r.issue ?? "")}`, priority: "Normal" }, 1);
        })
        .catch((e) => flash(errText(e)));

    const drawerAct = (k: string, kind: string, id: string, dv?: FsDrawer) => {
      const i = k.indexOf(":");
      const p = i < 0 ? k : k.slice(0, i);
      const v = i < 0 ? "" : k.slice(i + 1);
      if (p === "dw") return woAction(id, v === "full" ? "full" : v);
      if (p === "dr") return rowAction("req", id, v);
      if (p === "dt") return rowAction("ov-cap", id, "Contact technician");
      if (p === "rp") {
        const txt = dv?.sections.find((x) => x.h === "Work performed")?.text ?? "";
        if (v === "send") return run(async () => msgOf(await fsApi.sendReport(id, `${dv?.title ?? ""}: ${txt}`.slice(0, 900)), "Sent."));
        const html = `<!doctype html><meta charset="utf-8"><title>${dv?.title ?? "Service report"}</title><body style="font-family:system-ui;max-width:720px;margin:24px auto;color:#101828"><h1 style="font-size:20px">${dv?.title ?? ""}</h1>${(dv?.sections ?? []).filter((x) => x.h !== "Excluded from customer copy").map((x) => `<h2 style="font-size:14px;margin-top:18px">${x.h}</h2>${x.text ? `<p style="white-space:pre-wrap">${x.text}</p>` : ""}${x.kv ? `<table>${x.kv.map((r) => `<tr><td style="color:#667085;padding-right:12px">${r.k}</td><td>${r.v}</td></tr>`).join("")}</table>` : ""}${x.items ? `<ul>${x.items.map((r) => `<li>${r.a} — ${r.b}</li>`).join("")}</ul>` : ""}`).join("")}</body>`;
        return run(async () => msgOf(await fsApi.saveReport(id, html), "Service report saved to the job."));
      }
      if (p === "da") {
        const x = opt?.equipment.find((e) => e.id === id);
        return v === "req" ? requestModal({ assetId: id }) : woWizard({ customerId: x?.customerId ?? undefined, assetId: id, siteId: x?.siteId ?? undefined });
      }
      if (p === "dg") return rowAction("agr", id, v);
      if (p === "dy") return v === "Create work order" ? caseWo(id) : wrnAction(id, v);
      if (p === "dp") return rowAction("pm", id, v);
      if (p === "di") return v === "approve" ? run(async () => msgOf(await fsApi.approveIns(id), "Approved.")) : followUp(id);
      if (p === "dk") return rowAction("tpl", id, v);
      void kind;
      return top(k);
    };
    const onDecide = (id: string, approve: boolean) => (approve ? run(async () => msgOf(await fsApi.decide(id, true), "Approved.")) : reason("Reject request", "Reason", "Reject", async (r) => msgOf(await fsApi.decide(id, false, r), "Rejected."), { danger: true }));

    // ── settings ──────────────────────────────────────────────────────────
    const settingsBtn = (k: string, saved?: Record<string, unknown>) => {
      const s = st.getState();
      if (k === "set-reset") return st.getState().set({ draft: {} });
      if (k.startsWith("opt-add:")) {
        const path = `config.${k.slice(8)}`;
        return modal({
          title: "Add option",
          primaryT: "Add",
          fields: [F("v", "Name", "text", { req: true, af: true })],
          onSubmit: async (v) => {
            const d = Object.keys(s.draft).length ? s.draft : (JSON.parse(JSON.stringify(saved ?? {})) as Record<string, unknown>);
            const cur = (getPath(d, path) as string[] | undefined) ?? [];
            if (cur.includes(sv(v, "v"))) return "That option already exists.";
            st.getState().set({ draft: setPath(d, path, [...cur, sv(v, "v")]) });
            flash("Added to the draft — save settings to apply.");
          },
        });
      }
      if (k === "svc-new" || k.startsWith("svc-edit:")) {
        const x = k.startsWith("svc-edit:") ? svc(k.slice(9)) : undefined;
        return modal({
          title: x ? `Edit ${x.name}` : "Add service type",
          primaryT: "Save",
          wide: true,
          fields: [
            F("code", "Code", "text", { req: true, af: true, value: x?.code ?? "" }),
            F("name", "Name", "text", { req: true, value: x?.name ?? "" }),
            F("skill", "Required skill", "select", { value: x?.skill ?? "", options: O(opt?.cfg.skills ?? []) }),
            F("cert", "Required certification", "select", { value: x?.cert ?? "", options: [{ v: "", t: "None" }, ...O(opt?.cfg.certs ?? [])] }),
            F("durMin", "Default duration (min)", "number", { value: String(x?.durMin ?? 90), req: true }),
            F("priority", "Default priority", "select", { value: x?.priority ?? "Normal", options: prioOpts() }),
            F("proof", "Customer proof", "text", { value: x?.proof ?? "Signature" }),
            F("partProductIds", "Default parts (Inventory)", "checks", { options: (opt?.products ?? []).map((p) => ({ v: p.id, t: `${p.name}${p.sku ? ` · ${p.sku}` : ""}`, on: x?.parts.includes(p.id) })) }),
            F("laborProductId", "Labor billed as (service product)", "select", { value: x?.laborProductId ?? "", options: [{ v: "", t: "Not billed" }, ...(opt?.serviceProducts ?? []).map((p) => ({ v: p.id, t: p.name }))], help: "Invoices charge this product’s price × billable hours." }),
          ],
          onSubmit: async (v) => void (await after(msgOf(await fsApi.saveSvc(x?.id ?? null, { code: sv(v, "code"), name: sv(v, "name"), skill: sv(v, "skill"), cert: sv(v, "cert") || null, durMin: Number(sv(v, "durMin")), priority: sv(v, "priority"), proof: sv(v, "proof"), partProductIds: (v.partProductIds as string[]) ?? [], laborProductId: sv(v, "laborProductId") || null }), "Saved."))),
        });
      }
      if (k === "tech-new" || k.startsWith("tech-edit:")) {
        const t = k.startsWith("tech-edit:") ? opt?.techs.find((x) => x.id === k.slice(10)) : undefined;
        return modal({
          title: t ? `Technician · ${t.name}` : "Add technician profile",
          primaryT: "Save",
          wide: true,
          fields: [
            F("userId", "Staff member", "select", { value: t?.id ?? "", req: true, options: t ? [{ v: t.id, t: t.name }] : [{ v: "", t: "Choose…" }, ...(opt?.people ?? []).filter((p) => !opt?.techs.some((x) => x.id === p.id)).map((p) => ({ v: p.id, t: `${p.name} · ${p.role}` }))] }),
            F("skills", "Skills", "checks", { options: (opt?.cfg.skills ?? []).map((x) => ({ v: x, t: x, on: t?.skills.includes(x) })) }),
            F("certs", "Certifications", "checks", { options: (opt?.cfg.certs ?? []).map((x) => ({ v: x, t: x, on: t?.certs.includes(x) })) }),
            F("territories", "Territories", "checks", { options: (opt?.cfg.territories ?? []).map((x) => ({ v: x, t: x, on: t?.territories.includes(x) })) }),
            F("shiftStart", "Default shift start", "select", { value: String(t?.shiftStart ?? 9), options: timeOpts() }),
            F("shiftEnd", "Default shift end", "select", { value: String(t?.shiftEnd ?? 18), options: timeOpts() }),
            F("tracking", "Share check-in location", "select", { value: t?.tracking === false ? "no" : "yes", options: O([["yes", "Yes — during shift"], ["no", "No"]]) }),
            F("active", "Active", "select", { value: t?.active === false ? "no" : "yes", options: O([["yes", "Active"], ["no", "Inactive"]]) }),
          ],
          note: "Staff shifts (Staff › Schedule) override the default shift whenever the person has any.",
          onSubmit: async (v) => void (await after(msgOf(await fsApi.saveTech({ userId: sv(v, "userId"), skills: (v.skills as string[]) ?? [], certs: (v.certs as string[]) ?? [], territories: (v.territories as string[]) ?? [], shiftStart: Number(sv(v, "shiftStart")), shiftEnd: Number(sv(v, "shiftEnd")), tracking: sv(v, "tracking") !== "no", active: sv(v, "active") !== "no" }), "Saved."))),
        });
      }
    };

    const handlers: Omit<RenderHandlers, "sel"> = {
      kpiClick,
      blockAct: (k) => top(k),
      segPick: (b, k) => {
        const s = st.getState();
        const vk = ({ wo: "woCols", cal: "calView", "cal-g": "calView", "w-h": "wTab", ins: "insView", tpl: "insView" } as Record<string, string>)[b];
        if (vk) st.getState().set({ view: { ...s.view, [vk]: k }, page: {} });
      },
      setQ: (b, v) => {
        const s = st.getState();
        const fb = b === "dsp-q" ? "dsp" : b;
        st.getState().set({ f: { ...s.f, [fb]: { ...(s.f[fb] ?? {}), q: v } }, page: {} });
      },
      setF: (b, k, v) => {
        const s = st.getState();
        const fb = ({ "ov-f": "ov", "dsp-q": "dsp", "map-z": "map", "tw-who": "tw" } as Record<string, string>)[b] ?? b;
        if (k === "day" && (fb === "dsp" || fb === "cal")) return st.getState().set({ dDay: Number(v) });
        if (k === "techView") return st.getState().set({ techView: v });
        if (k === "view" && fb === "wo") {
          const SV: Record<string, Record<string, string>> = { mine: { tech: "me" }, unassigned: { st: "unassigned" }, emergency: { prio: "Emergency" }, today: { day: "today" }, sla: { sla: "At Risk" }, parts: { st: "Awaiting Parts" }, warranty: { agr: "wrn" }, agr: { agr: "agr" }, ready: { st: "Assigned", parts: "Ready" } };
          return st.getState().set({ f: { ...s.f, wo: { ...(SV[v] ?? {}), view: v } }, page: {} });
        }
        st.getState().set({ f: { ...s.f, [fb]: { ...(s.f[fb] ?? {}), [k]: v } }, page: {}, sel: [] });
      },
      clearF: (b) => {
        const s = st.getState();
        const fb = ({ "ov-f": "ov", "dsp-q": "dsp", "map-z": "map" } as Record<string, string>)[b] ?? b;
        st.getState().set({ f: { ...s.f, [fb]: {} }, page: {} });
      },
      pageGo: (d) => st.getState().set((s) => ({ page: { ...s.page, wo: Math.max(0, (s.page.wo ?? 0) + d) } })),
      selRow: (id) => st.getState().set((s) => ({ sel: s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id] })),
      selAll: (ids) => st.getState().set({ sel: ids }),
      rowOpen: (b, id) => {
        const def: Record<string, string> = { "ov-att": "Open", "ov-today": "Open", "ov-cap": "Open", wo: "Open", req: "Open", "dsp-q": "Open", "dsp-l": "Open technician", cal: "Open", "map-t": "Open technician", "map-j": "Open", "w-hist": "Open", "tw-list": "Open job", ins: "Open", tpl: "Open", eq: "Open", pm: "Open", agr: "View entitlement", wrn: "Open" };
        if (b === "ov-att" && id.startsWith("apr:")) return open("approvals", "_");
        if (def[b]) rowAction(b, id, def[b]);
      },
      rowAct: (b, id, v) => rowAction(b, id, v),
      cardOpen: (b, id) => {
        if (b === "map-z") go("workorders", undefined, { zone: id, st: "open" }, "wo");
      },
      calOpen: (_b, id) => open("wo", id),
    };

    return { handlers, top, drawerAct, onDecide, settingsBtn, after, flash, run, go };
  }, [opt, qc, router]);
}
