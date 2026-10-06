"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { amApi, amDownload, type AmDrawer, type AmItem, type AmOptions } from "@/lib/assets-api";
import { fsApi } from "@/lib/field-service-api";
import type { RenderHandlers } from "@/components/payments/pay-render";
import { amScopeOf, getPath, setPath, useAm, type AField, type AModal, type AValues } from "./am-store";

export const AM_PATH: Record<string, string> = {
  overview: "",
  register: "/assets",
  detail: "/assets/",
  taxonomy: "/categories-locations",
  requests: "/requests",
  workorders: "/work-orders",
  pm: "/preventive-maintenance",
  history: "/history",
  analytics: "/analytics",
  settings: "/settings",
};
export const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

const F = (name: string, label: string, type: AField["type"] = "text", o: Partial<AField> = {}): AField => ({ name, label, type, ...o });
const O = (a: (string | [string, string])[]) => a.map((x) => (typeof x === "string" ? { v: x, t: x } : { v: x[0], t: x[1] }));
const sv = (v: AValues, k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
const nv = (v: AValues, k: string) => (sv(v, k) === "" ? null : Number(sv(v, k)));
const today = () => new Date().toISOString().slice(0, 10);
const plus = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const LEVELS = ["Critical", "High", "Medium", "Low"];
const CONDS = ["Excellent", "Good", "Fair", "Poor", "Critical", "Unknown"];
/** The renderer's row ids may carry a related id after "|". */
const split = (id: string) => id.split("|") as [string, string | undefined];

export function useAmActions(opt: AmOptions | undefined) {
  const router = useRouter();
  const qc = useQueryClient();
  return useMemo(() => {
    const st = useAm;
    const R = opt?.rights;
    const flash = (t: string) => st.getState().flash(t);
    const modal = (m: AModal) => st.getState().openModal(m);
    const refresh = () => qc.invalidateQueries({ queryKey: ["am"] });
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
    const open = (kind: string, id: string, tab?: string) => st.getState().set({ drawer: { kind, id, tab } });
    const go = (tab: string, id?: string) => {
      st.getState().set({ drawer: null, sel: [], ...(id ? { cur: id, seg: { ...st.getState().seg, d: st.getState().cur === id ? (st.getState().seg.d ?? "overview") : "overview" } } : {}) });
      router.push(`/assets-maintenance${tab === "detail" ? `/assets/${id ?? st.getState().cur}` : AM_PATH[tab]}`);
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    };
    const confirm = (title: string, sub: string, primaryT: string, fn: (reason: string) => Promise<string>, o: { danger?: boolean; reason?: boolean } = {}) =>
      modal({ title, sub, primaryT, pBg: o.danger ? "#B42318" : "#12A150", fields: o.reason ? [F("reason", "Reason", "text", { req: true, af: true })] : [], onSubmit: async (v) => { await after(await fn(sv(v, "reason"))); } });

    // ── option lists ──────────────────────────────────────────────────────
    const assetOpts = (f?: (a: AmOptions["assets"][number]) => boolean) => (opt?.assets ?? []).filter((a) => a.live && (!f || f(a))).map((a) => ({ v: a.id, t: `${a.number} · ${a.name}` }));
    const whoOpts = (blank = "Unassigned") => [
      { v: "", t: blank },
      ...(opt?.people ?? []).map((p) => ({ v: `u:${p.id}`, t: `${p.name} · ${p.role}` })),
      ...(opt?.teams ?? []).map((t) => ({ v: `t:${t.id}`, t: `${t.name} team` })),
      ...(opt?.suppliers ?? []).map((s) => ({ v: `s:${s.id}`, t: `Vendor · ${s.name}` })),
    ];
    const locOpts = (except?: string) => (opt?.locations ?? []).filter((l) => l.status === "Active" && l.id !== except).map((l) => ({ v: l.id, t: l.path }));
    const branchOpts = () => (opt?.branches ?? []).map((b) => ({ v: b.id, t: b.name }));
    const catOpts = (blank = "None") => [{ v: "", t: blank }, ...(opt?.categories ?? []).filter((c) => c.status === "Active").map((c) => ({ v: c.id, t: `${c.parentId ? "— " : ""}${c.name}` }))];
    const cfg = opt?.cfg;

    // ── assets ────────────────────────────────────────────────────────────
    const assetModal = async (id?: string, dupOk = false) => {
      const a = id ? await amApi.getAsset(id).catch((e) => (flash(errText(e)), null)) : null;
      if (id && !a) return;
      const v = (k: string) => (a ? String(a[k] ?? "") : "");
      const cfields = (opt?.fields ?? []).map((f) =>
        F(`cf_${f.id}`, f.name, f.type === "Dropdown" ? "select" : f.type === "Number" ? "number" : f.type === "Date" ? "date" : f.type === "Yes/No" || f.type === "Staff reference" ? "select" : "text", {
          value: a ? String(((a.custom as Record<string, unknown>) ?? {})[f.id] ?? "") : "",
          options: f.type === "Dropdown" ? [{ v: "", t: "—" }, ...O(f.options)] : f.type === "Yes/No" ? O([["", "—"], ["Yes", "Yes"], ["No", "No"]]) : f.type === "Staff reference" ? [{ v: "", t: "—" }, ...(opt?.people ?? []).map((p) => ({ v: p.id, t: p.name }))] : undefined,
          help: f.categoryIds.length ? `For ${f.categoryIds.map((c) => opt?.categories.find((x) => x.id === c)?.name ?? "").join(", ")}` : undefined,
        }),
      );
      modal({
        title: a ? `Edit ${a.number} (v${a.version})` : "Add asset",
        sub: a ? `Saved with expected version v${a.version} — if someone else saved first you’ll get a conflict, never a silent overwrite.` : "Each physical item gets its own asset. Duplicates are checked on tag, serial, barcode and manufacturer + model + serial.",
        primaryT: a ? "Save changes" : "Create asset",
        wide: true,
        fields: [
          F("name", "Asset name", "text", { req: true, value: v("name"), af: true }),
          F("number", "Asset number", "text", { value: a ? a.number : (opt?.nextNumber ?? ""), help: cfg?.numbering.manual ? "Auto-numbered; manual override allowed" : "Auto-numbered (manual override is off in Asset Settings)" }),
          F("tag", "Asset tag", "text", { value: v("tag") }),
          F("categoryId", "Category", "select", { value: v("categoryId"), options: catOpts() }),
          F("status", "Status", "select", { value: a ? a.status : "Active", options: O(a ? [a.status] : ["Active", "Draft", "In Storage"]), help: a ? "Change status from More actions (transitions are validated)" : undefined }),
          F("criticality", "Criticality", "select", { value: v("criticality") || "", options: [{ v: "", t: "Category default" }, ...O(LEVELS)] }),
          F("condition", "Condition", "select", { value: v("condition") || "Good", options: O(CONDS) }),
          F("serial", "Serial number", "text", { value: v("serial") }),
          F("barcode", "Barcode", "text", { value: v("barcode") }),
          F("manufacturer", "Manufacturer", "text", { value: v("manufacturer") }),
          F("model", "Model", "text", { value: v("model") }),
          F("ownerType", "Owner type", "select", { value: v("ownerType") || "Business-owned", options: O(["Business-owned", "Customer-owned", "Leased", "Rented", "Supplier-owned", "Other"]) }),
          F("customerId", "Customer (CRM, if customer-owned)", "select", { value: v("customerId"), options: [{ v: "", t: "—" }, ...(opt?.customers ?? []).map((c) => ({ v: c.id, t: c.name }))] }),
          F("locationId", "Location", "select", { value: v("locationId"), options: [{ v: "", t: "No specific location (branch only)" }, ...locOpts()] }),
          F("branchId", "Branch (when no location)", "select", { value: v("branchId"), options: branchOpts() }),
          F("teamId", "Responsible team", "select", { value: v("teamId"), options: [{ v: "", t: "—" }, ...(opt?.teams ?? []).map((t) => ({ v: t.id, t: t.name }))] }),
          F("parentId", "Parent asset (component of)", "select", { value: v("parentId"), options: [{ v: "", t: "—" }, ...assetOpts((x) => x.id !== id)] }),
          F("productId", "Catalog product (Products & Services)", "select", { value: v("productId"), options: [{ v: "", t: "—" }, ...(opt?.products ?? []).map((p) => ({ v: p.id, t: p.name }))] }),
          F("purchasedOn", "Purchase date", "date", { value: v("purchasedOn") }),
          F("installedOn", "Install date", "date", { value: v("installedOn") }),
          ...(R?.cost
            ? [
                F("cost", "Purchase cost", "number", { value: a?.cost != null ? String(a.cost) : "", help: "Reference only — capitalisation happens in Finance" }),
                F("finAssetId", "Finance fixed asset", "select", { value: v("finAssetId"), options: [{ v: "", t: "Not capitalised" }, ...(opt?.finAssets ?? []).map((f) => ({ v: f.id, t: `${f.number} · ${f.name}` }))] }),
              ]
            : []),
          F("warrantyProvider", "Warranty provider", "text", { value: v("warrantyProvider") }),
          F("warrantyType", "Warranty type", "select", { value: v("warrantyType"), options: [{ v: "", t: "None" }, ...O(cfg?.wtypes ?? [])] }),
          F("warrantyStart", "Warranty start", "date", { value: v("warrantyStart") }),
          F("warrantyEnd", "Warranty expiry", "date", { value: v("warrantyEnd") }),
          F("meterType", "Meter type", "select", { value: v("meterType"), options: [{ v: "", t: "No meter" }, ...O(cfg?.meters ?? [])] }),
          ...(a
            ? []
            : [
                F("initialReading", "Initial meter reading", "number"),
                F("templateId", "Default PM plan (template)", "select", { options: [{ v: "", t: "Category default / none" }, ...(opt?.templates ?? []).map((t) => ({ v: t.id, t: t.name }))] }),
                F("dup", "Duplicate check", "select", { value: dupOk ? "ok" : "", options: O([["", "Stop me if a possible duplicate is found"], ["ok", "I reviewed possible duplicates — this is a different physical item"]]) }),
              ]),
          F("description", "Description", "area", { value: v("description") }),
          ...cfields,
        ],
        onSubmit: async (vals) => {
          const custom: Record<string, string> = {};
          (opt?.fields ?? []).forEach((f) => {
            if (sv(vals, `cf_${f.id}`)) custom[f.id] = sv(vals, `cf_${f.id}`);
          });
          const body: Record<string, unknown> = {
            name: sv(vals, "name"),
            number: sv(vals, "number") === (a ? a.number : opt?.nextNumber) ? undefined : sv(vals, "number"),
            tag: sv(vals, "tag"),
            categoryId: sv(vals, "categoryId"),
            criticality: sv(vals, "criticality") || undefined,
            condition: sv(vals, "condition"),
            serial: sv(vals, "serial"),
            barcode: sv(vals, "barcode"),
            manufacturer: sv(vals, "manufacturer"),
            model: sv(vals, "model"),
            ownerType: sv(vals, "ownerType"),
            customerId: sv(vals, "customerId"),
            locationId: sv(vals, "locationId"),
            branchId: sv(vals, "branchId"),
            teamId: sv(vals, "teamId"),
            parentId: sv(vals, "parentId"),
            productId: sv(vals, "productId"),
            purchasedOn: sv(vals, "purchasedOn"),
            installedOn: sv(vals, "installedOn"),
            warrantyProvider: sv(vals, "warrantyProvider"),
            warrantyType: sv(vals, "warrantyType"),
            warrantyStart: sv(vals, "warrantyStart"),
            warrantyEnd: sv(vals, "warrantyEnd"),
            meterType: sv(vals, "meterType"),
            description: sv(vals, "description"),
            custom,
          };
          if (R?.cost) {
            body.cost = nv(vals, "cost");
            body.finAssetId = sv(vals, "finAssetId");
          }
          if (a) {
            const r = await amApi.updateAsset(a.id, { ...body, expectedVersion: a.version });
            await after(`${r.number} saved (v${r.version}).`);
            return;
          }
          const r = await amApi.createAsset({ ...body, status: sv(vals, "status"), initialReading: nv(vals, "initialReading"), templateId: sv(vals, "templateId") || undefined, dupOk: sv(vals, "dup") === "ok" });
          await after(`${r.number} created.`);
          go("detail", r.id);
        },
      });
    };

    const readingModal = (id?: string) => {
      const a = opt?.assets.find((x) => x.id === id);
      modal({
        title: "Record meter reading",
        sub: "Readings are append-only. Enter the value shown on the meter (or read it from a photo of the meter).",
        primaryT: "Record reading",
        fields: [
          F("assetId", "Asset", "select", { value: id ?? "", req: true, options: [{ v: "", t: "Pick an asset" }, ...assetOpts((x) => !!x.meterType)] }),
          F("value", `Reading${a?.meterUnit ? ` (${a.meterUnit})` : ""}`, "number", { req: true, af: true }),
          F("source", "Source", "select", { options: O(["Manual", "Photo of meter"]) }),
        ],
        onSubmit: async (v) => {
          const r = await amApi.reading({ assetId: sv(v, "assetId"), value: Number(sv(v, "value")), source: sv(v, "source") });
          await after(`Reading saved.${r.dueByMeter.length ? ` ${r.dueByMeter.join(", ")} is now due by meter — the PM evaluator will generate it once.` : ""}`);
        },
      });
    };

    const transferModal = (id: string) => {
      const a = opt?.assets.find((x) => x.id === id);
      modal({
        title: `Transfer ${a?.number ?? ""}`,
        primaryT: "Transfer",
        fields: [
          F("locationId", "To location", "select", { options: [{ v: "", t: "No specific location (pick a branch)" }, ...locOpts()] }),
          F("branchId", "Or to branch", "select", { options: [{ v: "", t: "—" }, ...branchOpts()] }),
          F("effective", "Effective date", "date", { value: today(), req: true }),
          F("teamId", "Responsible team", "select", { value: a?.teamId ?? "", options: [{ v: "", t: "Keep current" }, ...(opt?.teams ?? []).map((t) => ({ v: t.id, t: t.name }))] }),
          F("reason", "Reason", "text", { req: true }),
          F("notes", "Notes", "area"),
        ],
        onSubmit: async (v) => {
          await amApi.transfer(id, { locationId: sv(v, "locationId") || undefined, branchId: sv(v, "branchId") || undefined, effective: sv(v, "effective"), teamId: sv(v, "teamId") || undefined, reason: sv(v, "reason"), notes: sv(v, "notes") });
          await after(`${a?.number ?? "Asset"} transferred.`);
        },
      });
    };

    const retireModal = (id: string) => {
      const a = opt?.assets.find((x) => x.id === id);
      modal({
        title: `Retire or dispose ${a?.number ?? ""}`,
        sub: "Closes future PM plans and cancels open requests. History, downtime, costs, inspections, documents and audit are kept. Blocked while work orders are open.",
        primaryT: "Confirm",
        pBg: "#B42318",
        fields: [
          F("to", "Action", "select", { options: O(a?.status === "Retired" ? ["Disposed"] : ["Retired", "Disposed"]) }),
          F("date", "Date", "date", { value: today(), req: true }),
          F("reason", "Reason", "text", { req: true, af: true }),
          F("disposition", "Disposition", "select", { options: O(["Kept as spare", "Sold", "Scrapped", "Recycled (e-waste)", "Returned to lessor", "Donated"]) }),
          F("replacementId", "Replacement asset", "select", { options: [{ v: "", t: "None" }, ...assetOpts((x) => x.id !== id)] }),
          F("finRef", "Finance reference", "text", { help: "Disposal accounting (gain/loss) is posted in Finance & Accounting › Fixed Assets" }),
          F("notes", "Notes", "area"),
        ],
        onSubmit: async (v) => {
          const r = await amApi.retire(id, { to: sv(v, "to"), date: sv(v, "date"), reason: sv(v, "reason"), disposition: sv(v, "disposition"), replacementId: sv(v, "replacementId") || undefined, finRef: sv(v, "finRef"), notes: sv(v, "notes") });
          await after(`${a?.number ?? "Asset"} ${sv(v, "to").toLowerCase()}. ${r.plansClosed} future PM plan(s) closed; all history kept.`);
        },
      });
    };

    const statusModal = async (id: string) => {
      const a = await amApi.getAsset(id).catch(() => null);
      if (!a) return;
      const T: Record<string, string[]> = {
        Draft: ["Active", "Archived"],
        Active: ["Inactive", "Under Maintenance", "Out of Service", "In Storage", "Transferred", "Retired", "Lost"],
        Inactive: ["Active", "In Storage", "Retired", "Archived"],
        "Under Maintenance": ["Active", "Out of Service", "Retired"],
        "Out of Service": ["Active", "Under Maintenance", "Retired", "Disposed"],
        "In Storage": ["Active", "Retired", "Disposed", "Lost"],
        Transferred: ["Active"],
        Retired: ["Disposed", "Archived"],
        Disposed: ["Archived"],
        Lost: ["Active", "Disposed", "Archived"],
        Archived: [],
      };
      const next = (T[a.status] ?? []).filter((s) => cfg?.statuses.allowed.includes(s) ?? true);
      if (!next.length) return flash(`${a.number} is ${a.status} — no further status changes.`);
      modal({
        title: `Change status · ${a.number}`,
        sub: `Current: ${a.status}. Allowed next: ${next.join(", ")}`,
        primaryT: "Change status",
        fields: [F("to", "New status", "select", { options: O(next) }), F("reason", "Reason", "text", { req: true })],
        onSubmit: async (v) => {
          if (["Retired", "Disposed"].includes(sv(v, "to"))) {
            await amApi.retire(id, { to: sv(v, "to"), date: today(), reason: sv(v, "reason") });
          } else if (sv(v, "to") === "Archived") await amApi.archive(id, sv(v, "reason"));
          else await amApi.status(id, sv(v, "to"), sv(v, "reason"));
          await after("Status changed.");
        },
      });
    };

    const qrModal = (id: string) => {
      const a = opt?.assets.find((x) => x.id === id);
      const url = `${typeof window !== "undefined" ? window.location.origin : ""}/assets-maintenance/assets/${id}`;
      modal({
        title: `QR label · ${a?.number ?? ""}`,
        sub: `${a?.name ?? ""}. Scanning opens this asset (Scan QR / Barcode resolves the same code).`,
        primaryT: "Print label",
        fields: [F("qr", "QR code", "qr", { value: url }), F("code", "Encoded", "read", { value: url })],
        onSubmit: async () => {
          const svg = document.getElementById("am-qr")?.outerHTML ?? "";
          const w = window.open("", "_blank", "width=420,height=520");
          if (w) {
            w.document.write(`<html><head><title>${a?.number ?? "Asset"}</title></head><body style="font-family:sans-serif;text-align:center;padding:24px">${svg}<div style="font-weight:800;font-size:18px;margin-top:10px">${a?.number ?? ""}</div><div style="font-size:12px">${(a?.name ?? "").replace(/</g, "&lt;")}</div></body></html>`);
            w.document.close();
            w.focus();
            w.print();
          }
          return "keep";
        },
      });
    };

    const docModal = (id: string) =>
      modal({
        title: "Upload document",
        sub: "Stored with this asset (manuals, warranties, certificates, photos). Up to 20 MB.",
        primaryT: "Upload",
        fields: [F("file", "File", "file", { req: true }), F("type", "Type", "select", { options: O(["Manual", "Warranty", "Certificate", "Photo", "Inspection Document", "Service report"]) })],
        onSubmit: async (v) => {
          const r = await amApi.uploadDoc(id, v.file as File, sv(v, "type"));
          await after(`${r.name} uploaded.`);
        },
      });

    const assetAct = (aid: string, v: string) => {
      if (v === "Open" || v === "Open asset" || v === "View assets") return go("detail", aid);
      if (v === "Create request" || v === "Create follow-up request") return requestModal({ assetId: aid });
      if (v === "Record reading") return readingModal(aid);
      if (v === "Schedule maintenance") return void planModal(null, aid);
      if (v === "Edit") return void assetModal(aid);
      if (v === "Transfer") return transferModal(aid);
      if (v === "Retire / dispose") return retireModal(aid);
      if (v === "Change status") return void statusModal(aid);
      if (v === "Print QR") return qrModal(aid);
      if (v === "Archive") return confirm("Archive asset?", "Archived assets keep all history and can’t return to Active. Active and paused PM plans are archived too.", "Archive", async (r) => (await amApi.archive(aid, r), "Archived."), { danger: true, reason: true });
      if (v === "History") return st.getState().set((s) => ({ seg: { ...s.seg, d: "tl" } }));
      if (v === "Audit") return st.getState().set((s) => ({ seg: { ...s.seg, d: "audit" } }));
      if (v === "Why at risk?") return open("asset", aid);
      if (v === "Open warranty document") {
        st.getState().set((s) => ({ seg: { ...s.seg, d: "docs" } }));
        return go("detail", aid);
      }
      if (v === "Downtime records") return open("list", `down:${aid}`);
    };

    // ── requests ──────────────────────────────────────────────────────────
    const requestModal = (p: { assetId?: string; title?: string; desc?: string; type?: string } = {}) =>
      modal({
        title: "Create maintenance request",
        sub: "Asset issue. For customer-owned equipment, use “Link to Field Service” afterwards to dispatch a technician to the customer site.",
        primaryT: "Submit request",
        fields: [
          F("assetId", "Asset", "select", { value: p.assetId ?? "", req: true, options: [{ v: "", t: "Pick an asset" }, ...assetOpts()] }),
          F("issueType", "Issue type", "select", { value: p.type ?? "", options: O(cfg?.issueTypes ?? []) }),
          F("title", "Title", "text", { req: true, af: true, value: p.title ?? "" }),
          F("description", "Description", "area", { value: p.desc ?? "" }),
          F("observed", "Observed condition", "select", { value: opt?.assets.find((a) => a.id === p.assetId)?.condition ?? "Fair", options: O(["Good", "Fair", "Poor", "Critical", "Unknown"]) }),
          F("priority", "Priority", "select", { value: "Medium", options: O(cfg?.priorities ?? LEVELS) }),
          F("safety", "Safety concern?", "select", { options: O([["", "No"], ["1", "Yes — safety concern"]]) }),
          F("op", "Is the asset operational?", "select", { options: O([["1", "Yes, still working"], ["0", "No — it’s down (starts downtime)"]]) }),
          F("reading", "Meter reading (optional)", "number"),
          F("photo", "Photo (optional)", "file", { accept: "image/*" }),
          F("preferredOn", "Preferred date", "date"),
        ],
        onSubmit: async (v) => {
          const r = await amApi.request({ assetId: sv(v, "assetId"), issueType: sv(v, "issueType"), title: sv(v, "title"), description: sv(v, "description"), observed: sv(v, "observed"), priority: sv(v, "priority"), safety: !!sv(v, "safety"), operational: sv(v, "op") !== "0", reading: nv(v, "reading"), preferredOn: sv(v, "preferredOn") || undefined });
          let photo = "";
          if (v.photo instanceof File) {
            try {
              await amApi.uploadDoc(sv(v, "assetId"), v.photo, "Photo");
            } catch (e) {
              photo = ` Photo not saved: ${errText(e)}`;
            }
          }
          await after(`${r.number} submitted for triage.${sv(v, "op") === "0" ? " Downtime started." : ""}${photo}`);
        },
      });

    const convertModal = (rid: string, pri = "Medium") =>
      modal({
        title: "Convert to a work order",
        sub: "The request stays linked and is marked Converted — it is never deleted. Orders above the criticality approval threshold start as Draft.",
        primaryT: "Create work order",
        fields: [
          F("type", "Maintenance type", "select", { value: "Corrective", options: O(cfg?.mtypes ?? []) }),
          F("priority", "Priority", "select", { value: pri, options: O(cfg?.priorities ?? LEVELS) }),
          F("who", "Assignee / team / vendor", "select", { options: whoOpts() }),
          F("due", "Due date", "date", { value: plus(pri === "Critical" ? 1 : 5), req: true }),
          F("checklist", "Checklist (one step per line)", "area", { value: "Diagnose\nRepair / replace\nTest and record condition" }),
          F("down", "Estimated downtime (hours)", "number", { value: "1" }),
          F("parts", "Parts (Inventory items, 1 each — adjust later)", "checks", { options: (opt?.products ?? []).map((p) => ({ v: p.id, t: `${p.name} · on hand ${p.stock}` })) }),
        ],
        onSubmit: async (v) => {
          const r = await amApi.convert(rid, { type: sv(v, "type"), priority: sv(v, "priority"), who: sv(v, "who") || undefined, due: sv(v, "due"), checklist: sv(v, "checklist").split("\n").filter(Boolean), expectedDownH: nv(v, "down"), parts: (v.parts as string[]).map((productId) => ({ productId, qty: 1 })) });
          await after(`${r.wo.number} created${r.draft ? " as Draft (needs approval)" : ""}. Request stays linked.`);
        },
      });

    const reqAction = (id: string, v: string) => {
      if (v === "View") return open("req", id);
      const act = (b: Record<string, unknown>, msg: string) => run(async () => (await amApi.reqAction(id, b), msg));
      if (v === "Assign triage")
        return modal({ title: "Assign triage", primaryT: "Assign", fields: [F("who", "Triage owner", "select", { options: (opt?.people ?? []).map((p) => ({ v: `u:${p.id}`, t: `${p.name} · ${p.role}` })) })], onSubmit: async (x) => { await amApi.reqAction(id, { act: v, who: sv(x, "who") }); await after("Triage assigned."); } });
      if (v === "Change priority")
        return modal({ title: "Change priority", primaryT: "Save", fields: [F("priority", "Priority", "select", { options: O(cfg?.priorities ?? LEVELS) }), F("reason", "Reason", "text")], onSubmit: async (x) => { await amApi.reqAction(id, { act: v, priority: sv(x, "priority"), reason: sv(x, "reason") }); await after("Priority changed."); } });
      if (v === "Request more information")
        return modal({ title: "Request more information", primaryT: "Send to reporter", fields: [F("q", "What do you need?", "area", { req: true, af: true, value: "Please attach a photo and tell us when it started." })], onSubmit: async (x) => { await amApi.reqAction(id, { act: v, question: sv(x, "q") }); await after("Sent to the reporter (in-app notification)."); } });
      if (v === "Reject") return confirm("Reject request", "", "Reject", async (r) => (await amApi.reqAction(id, { act: v, reason: r }), "Request rejected."), { danger: true, reason: true });
      if (v === "Close") return confirm("Close request?", "The request and its links are kept.", "Close request", async (r) => (await amApi.reqAction(id, { act: v, reason: r }), "Request closed."), { reason: true });
      if (v === "Convert to work order") return convertModal(id);
      if (v === "Link to Field Service") return run(async () => (await fsApi.fromAssets("req", id)).msg);
      return act({ act: v }, `${v} — done.`);
    };

    // ── work orders ───────────────────────────────────────────────────────
    const woModal = (assetId?: string) =>
      modal({
        title: "Create maintenance work order",
        primaryT: "Create",
        wide: true,
        note: "Adding parts doesn’t reserve or move stock — stock moves only when parts are issued. Orders whose estimate is above the asset’s criticality approval threshold start as Draft.",
        fields: [
          F("assetId", "Asset", "select", { value: assetId ?? "", req: true, options: [{ v: "", t: "Pick an asset" }, ...assetOpts()] }),
          F("type", "Maintenance type", "select", { options: O(cfg?.mtypes ?? []) }),
          F("scope", "Problem / scope", "area", { req: true, af: true }),
          F("priority", "Priority", "select", { value: "Medium", options: O(cfg?.priorities ?? LEVELS) }),
          F("safety", "Safety", "select", { options: O([["", "No safety concern"], ["1", "Safety concern"]]) }),
          F("who", "Assignee / team / vendor", "select", { options: whoOpts() }),
          F("start", "Start", "date"),
          F("due", "Due", "date", { req: true, value: plus(7) }),
          F("checklist", "Checklist (one step per line)", "area"),
          F("parts", "Parts (Inventory items, 1 each — adjust later)", "checks", { options: (opt?.products ?? []).map((p) => ({ v: p.id, t: `${p.name} · on hand ${p.stock}` })) }),
          F("down", "Expected downtime (h)", "number", { value: "1" }),
          ...(R?.cost ? [F("est", "Estimated other cost (vendor / misc)", "number", { help: "Used with planned parts to check the approval threshold" })] : []),
        ],
        onSubmit: async (v) => {
          const r = await amApi.createWo({ assetId: sv(v, "assetId"), type: sv(v, "type"), scope: sv(v, "scope"), priority: sv(v, "priority"), safety: !!sv(v, "safety"), who: sv(v, "who") || undefined, start: sv(v, "start") || undefined, due: sv(v, "due"), checklist: sv(v, "checklist").split("\n").filter(Boolean), parts: (v.parts as string[]).map((productId) => ({ productId, qty: 1 })), expectedDownH: nv(v, "down"), estCost: nv(v, "est") });
          await after(`${r.wo.number} created${r.draft ? ` as Draft — ${r.above ? `estimate ${r.estimate.toLocaleString()} is above the approval threshold` : "needs approval"}` : ""}. Parts planned only — Inventory unchanged.`);
        },
      });

    const completeModal = async (id: string) => {
      const b = await amApi.woBrief(id).catch((e) => (flash(errText(e)), null));
      if (!b) return;
      modal({
        title: `Complete ${b.number}`,
        sub: `${b.asset.number} · ${b.asset.name}`,
        primaryT: "Complete work order",
        wide: true,
        fields: [
          F("outcome", "Completion outcome", "select", { req: true, options: O(["", "Resolved", "Partially Resolved", "Temporary Repair", "Replacement Required", "Unable to Repair", "Other"]) }),
          F("work", "Work performed", "area", { req: true, af: true }),
          F("condition", "Condition after", "select", { req: true, value: b.asset.condition === "Unknown" ? "Good" : b.asset.condition, options: O(["Excellent", "Good", "Fair", "Poor", "Critical"]) }),
          ...(b.asset.meterType ? [F("reading", `Meter reading (${b.asset.meterUnit ?? ""})`, "number")] : []),
          F("parts", "Parts", "read", { value: b.parts.length ? b.parts.map((p) => `${opt?.products.find((x) => x.id === p.productId)?.name ?? "Part"}: issued ${p.issued - p.returned} of ${p.planned} → ${p.issued - p.returned ? "recorded as used" : "nothing issued, nothing used"}`).join("\n") : "None" }),
          F("labor", "Your labor hours", "number", { help: "Costed at your hourly rate from Staff (if set)" }),
          ...(R?.cost
            ? [
                F("vcost", b.supplier ? "Vendor cost" : "Other cost", "number"),
                F("bill", "Finance bill for this cost", "select", { options: [{ v: "", t: "Not billed yet — don’t post" }, ...(opt?.finBills ?? []).map((x) => ({ v: x.id, t: x.label }))] }),
              ]
            : []),
          F("downEnd", "Downtime", "select", { options: O(b.openDowntime ? [["yes", "End downtime now"], ["no", "Asset still down"]] : [["no", "No downtime open"]]) }),
          F("after", "Asset status after", "select", { value: b.asset.status === "Under Maintenance" || b.asset.status === "Out of Service" ? "Active" : b.asset.status, options: O(["Active", "Out of Service", "In Storage", "Under Maintenance"]) }),
          F("next", "Next recommended maintenance", "text"),
          F("follow", "Follow-up required?", "select", { options: O([["", "No"], ["1", "Yes — create follow-up request"]]) }),
        ],
        onSubmit: async (v) => {
          const r = await amApi.complete(id, { outcome: sv(v, "outcome"), work: sv(v, "work"), condition: sv(v, "condition"), reading: nv(v, "reading"), laborHours: nv(v, "labor"), vendorCost: nv(v, "vcost"), finBillId: sv(v, "bill") || undefined, endDowntime: sv(v, "downEnd") === "yes", statusAfter: sv(v, "after"), next: sv(v, "next"), followUp: !!sv(v, "follow") });
          await after(`${b.number} completed (${sv(v, "outcome")}).${r.rolled ? " PM plan rolled to next due." : ""} Close it once reviewed.`);
        },
      });
    };

    const woAction = (id: string, v: string) => {
      if (v === "View") return open("wo", id);
      if (v === "Assign")
        return modal({ title: "Assign work order", primaryT: "Assign", fields: [F("who", "Assignee", "select", { req: true, options: whoOpts("Pick an assignee") })], onSubmit: async (x) => { await amApi.assign(id, sv(x, "who")); await after("Assigned."); } });
      if (v === "Schedule")
        return modal({ title: "Schedule work order", primaryT: "Schedule", note: "Times use the business timezone.", fields: [F("date", "Start date", "date", { req: true, value: plus(1) }), F("time", "Time", "time", { value: "09:00" }), F("due", "Due date", "date", { value: plus(2) })], onSubmit: async (x) => { await amApi.schedule(id, { date: sv(x, "date"), time: sv(x, "time"), due: sv(x, "due") || undefined }); await after("Scheduled."); } });
      if (v === "Complete") return void completeModal(id);
      if (v === "Cancel") return confirm("Cancel work order?", "If it came from a PM plan, its due instance is released so the evaluator can generate it again.", "Cancel work order", async (r) => (await amApi.move(id, "Cancel", r), "Cancelled."), { danger: true, reason: true });
      if (v === "Issue parts (Inventory)") return run(async () => { const r = await amApi.issue(id); return `Inventory confirmed: ${r.issued.join(", ")}.${r.short.length ? ` Short: ${r.short.join("; ")} — raise a purchase order.` : ""}`; });
      if (v === "Add part")
        return modal({ title: "Plan a part", sub: "Planning doesn’t move stock.", primaryT: "Add part", fields: [F("productId", "Inventory item", "select", { req: true, options: (opt?.products ?? []).map((p) => ({ v: p.id, t: `${p.name} · on hand ${p.stock}` })) }), F("qty", "Quantity", "number", { req: true, value: "1" })], onSubmit: async (x) => { await amApi.addPart(id, sv(x, "productId"), Number(sv(x, "qty"))); await after("Part planned."); } });
      if (v === "Log labor")
        return modal({ title: "Log labor", primaryT: "Log", fields: [F("userId", "Person", "select", { value: opt?.me.id ?? "", options: (opt?.people ?? []).map((p) => ({ v: p.id, t: p.name })) }), F("hours", "Hours", "number", { req: true, af: true })], onSubmit: async (x) => { const r = await amApi.labor(id, { userId: sv(x, "userId"), hours: Number(sv(x, "hours")) }); await after(r.rated ? "Labor logged and costed at the person’s hourly rate." : "Labor logged — no hourly rate set for this person, so no cost was added."); } });
      if (v === "Add vendor cost")
        return modal({ title: "Add cost", primaryT: "Add", fields: [F("type", "Type", "select", { options: O(["Vendor", "Other"]) }), F("amount", "Amount", "number", { req: true, af: true }), F("bill", "Finance bill", "select", { options: [{ v: "", t: "Not billed yet — don’t post" }, ...(opt?.finBills ?? []).map((x) => ({ v: x.id, t: x.label }))] }), F("note", "Note", "text")], onSubmit: async (x) => { await amApi.cost(id, { type: sv(x, "type"), amount: Number(sv(x, "amount")), finBillId: sv(x, "bill") || undefined, note: sv(x, "note") }); await after("Cost added."); } });
      if (v === "Change priority")
        return modal({ title: "Change priority", primaryT: "Save", fields: [F("priority", "Priority", "select", { options: O(cfg?.priorities ?? LEVELS) }), F("reason", "Reason", "text")], onSubmit: async (x) => { await amApi.priority(id, sv(x, "priority"), sv(x, "reason")); await after("Priority changed."); } });
      if (v === "Link to Field Service") return run(async () => (await fsApi.fromAssets("wo", id)).msg);
      return run(async () => {
        const r = await amApi.move(id, v);
        return `${r.number}: → ${r.status}.`;
      });
    };

    // ── preventive ────────────────────────────────────────────────────────
    const planModal = async (id: string | null, assetId?: string) => {
      const p = id ? await amApi.getPlan(id).catch((e) => (flash(errText(e)), null)) : null;
      if (id && !p) return;
      modal({
        title: p ? "Edit PM plan" : "Create PM plan",
        sub: "Time plans repeat by date; meter plans by the asset’s meter; hybrid plans use whichever comes first.",
        primaryT: p ? "Save plan" : "Create plan",
        wide: true,
        fields: [
          F("name", "Plan name", "text", { req: true, value: p?.name ?? "", af: true }),
          F("assetId", "Asset", "select", { value: p?.assetId ?? assetId ?? "", req: true, options: [{ v: "", t: "Pick an asset" }, ...assetOpts()] }),
          F("templateId", "Template", "select", { value: p?.templateId ?? "", options: [{ v: "", t: "None" }, ...(opt?.templates ?? []).map((t) => ({ v: t.id, t: t.name }))] }),
          F("trigger", "Trigger", "select", { value: p?.trigger ?? "Time", options: O([["Time", "Time based"], ["Meter", "Meter based"], ["Hybrid", "Hybrid — whichever comes first"]]) }),
          F("interval", "Interval", "number", { value: String(p?.interval ?? 3), req: true, help: "For meter plans: meter units between services" }),
          F("unit", "Time unit", "select", { value: p?.unit ?? "months", options: O(["days", "weeks", "months", "years"]) }),
          F("nextDueOn", "Next due date (time / hybrid)", "date", { value: p?.nextDueOn ?? plus(30) }),
          F("nextDueMeter", "Next due meter (meter / hybrid)", "number", { value: p?.nextDueMeter != null ? String(p.nextDueMeter) : "" }),
          F("meterInterval", "Meter interval (hybrid)", "number", { value: p?.meterInterval != null ? String(p.meterInterval) : "" }),
          F("who", "Responsible team / person / vendor", "select", { value: p?.who ?? "", options: whoOpts("Unassigned") }),
          F("auto", "Auto-create work order?", "select", { value: p ? (p.autoCreate ? "1" : "") : cfg?.pm.auto ? "1" : "", options: O([["1", "Yes"], ["", "No — remind only"]]) }),
          F("lead", "Lead time (days)", "number", { value: String(p?.leadDays ?? cfg?.pm.lead ?? 7) }),
        ],
        onSubmit: async (v) => {
          const body = { name: sv(v, "name"), assetId: sv(v, "assetId"), templateId: sv(v, "templateId") || undefined, trigger: sv(v, "trigger"), interval: Number(sv(v, "interval")), unit: sv(v, "unit"), nextDueOn: sv(v, "nextDueOn") || undefined, nextDueMeter: nv(v, "nextDueMeter"), meterInterval: nv(v, "meterInterval"), who: sv(v, "who") || undefined, autoCreate: !!sv(v, "auto"), leadDays: Number(sv(v, "lead") || 7) };
          if (p) await amApi.updatePlan(p.id, body);
          else await amApi.createPlan(body);
          await after("PM plan saved.");
        },
      });
    };

    const pmAction = (id: string, v: string) => {
      if (v === "View" || v === "Open plan") return open("pm", id);
      if (v === "Edit") return void planModal(id);
      if (v === "Generate work order") return run(async () => `${(await amApi.generate(id)).number} generated · due instance key stored; a retry won’t duplicate it.`);
      if (v === "Reschedule")
        return modal({ title: "Reschedule plan", primaryT: "Reschedule", fields: [F("date", "New next due date", "date", { req: true, value: plus(14) }), F("reason", "Reason", "text", { req: true })], onSubmit: async (x) => { await amApi.reschedule(id, sv(x, "date"), sv(x, "reason")); await after("Rescheduled."); } });
      if (v === "Pause" || v === "Resume") return run(async () => (await amApi.planStatus(id, v), `Plan ${v === "Pause" ? "paused" : "resumed"}.`));
      if (v === "Archive") return confirm("Archive plan?", "It stops generating work orders. History is kept.", "Archive", async () => (await amApi.planStatus(id, "Archive"), "Plan archived."), { danger: true });
    };

    // ── history ───────────────────────────────────────────────────────────
    const inspectModal = (assetId?: string) =>
      modal({
        title: "Record inspection",
        primaryT: "Save inspection",
        fields: [
          F("assetId", "Asset", "select", { value: assetId ?? "", req: true, options: [{ v: "", t: "Pick an asset" }, ...assetOpts()] }),
          F("kind", "Inspection type", "select", { options: O(["Routine", "Safety", "Pre-use", "Post-repair", "Regulatory"]) }),
          F("checklistRef", "Checklist reference", "text", { ph: "e.g. CHK-GEN-01 v3" }),
          F("result", "Result", "select", { req: true, options: O(["Pass", "Fail"]) }),
          F("score", "Score (0–100)", "number"),
          F("condition", "Condition after", "select", { value: opt?.assets.find((a) => a.id === assetId)?.condition ?? "Good", options: O(CONDS) }),
          F("findings", "Findings", "area", { req: true }),
          F("critical", "Critical finding?", "select", { options: O([["", "No"], ["1", "Yes"]]) }),
          F("recommendation", "Recommendations / follow-up", "text"),
        ],
        onSubmit: async (v) => {
          await amApi.inspect({ assetId: sv(v, "assetId"), kind: sv(v, "kind"), checklistRef: sv(v, "checklistRef"), result: sv(v, "result"), score: nv(v, "score"), condition: sv(v, "condition"), findings: sv(v, "findings"), critical: !!sv(v, "critical"), recommendation: sv(v, "recommendation") });
          await after(`Inspection saved.${sv(v, "result") === "Fail" ? " Create a follow-up request from the history drawer." : ""}`);
        },
      });
    const serviceModal = () =>
      modal({
        title: "Record service event",
        sub: "For service already performed (e.g. by a vendor). Links to a work order if one exists.",
        primaryT: "Save",
        fields: [
          F("assetId", "Asset", "select", { req: true, options: [{ v: "", t: "Pick an asset" }, ...assetOpts()] }),
          F("type", "Service type", "select", { options: O(["Maintenance", "Repair", "Calibration", "Warranty Service", "Replacement", "Upgrade"]) }),
          F("work", "Work performed", "area", { req: true, af: true }),
          F("by", "Provider / team / person", "select", { options: whoOpts("Me") }),
          F("condition", "Condition after", "select", { options: O(["", "Excellent", "Good", "Fair", "Poor", "Critical"]) }),
          F("outcome", "Outcome", "select", { options: O(["Resolved", "Partially Resolved", "Temporary Repair"]) }),
        ],
        onSubmit: async (v) => {
          await amApi.service({ assetId: sv(v, "assetId"), type: sv(v, "type"), work: sv(v, "work"), by: sv(v, "by") || undefined, condition: sv(v, "condition") || undefined, outcome: sv(v, "outcome") });
          await after("Service event recorded.");
        },
      });
    const correctModal = (rid: string) =>
      modal({ title: "Correct reading", sub: "The original stays in history. A correction record references it.", primaryT: "Record correction", fields: [F("value", "Correct value", "number", { req: true, af: true }), F("reason", "Reason", "text", { req: true })], onSubmit: async (v) => { await amApi.correct(rid, Number(sv(v, "value")), sv(v, "reason")); await after("Correction recorded. Original kept in history."); } });
    const downtimeModal = (assetId: string) =>
      modal({ title: "Log downtime", primaryT: "Start downtime", fields: [F("kind", "Type", "select", { options: O(["Unplanned", "Planned"]) }), F("reason", "Reason", "select", { options: O(cfg?.dreasons ?? []) }), F("cause", "Cause", "text", { req: true, af: true }), F("impact", "Impact", "text")], onSubmit: async (v) => { await amApi.downtime({ assetId, kind: sv(v, "kind"), reason: sv(v, "reason"), cause: sv(v, "cause"), impact: sv(v, "impact") }); await after("Downtime started."); } });

    // ── taxonomy ──────────────────────────────────────────────────────────
    const categoryModal = (id: string | null) => {
      const c = id ? opt?.categories.find((x) => x.id === id) : null;
      modal({
        title: id ? "Edit category" : "New category",
        primaryT: "Save",
        fields: [
          F("name", "Name", "text", { req: true, value: c?.name ?? "", af: true }),
          F("code", "Code", "text", { req: true, value: c?.code ?? "" }),
          F("parentId", "Parent", "select", { value: c?.parentId ?? "", options: [{ v: "", t: "None (top level)" }, ...(opt?.categories ?? []).filter((x) => !x.parentId && x.id !== id).map((x) => ({ v: x.id, t: x.name }))] }),
          F("criticality", "Default criticality", "select", { value: c?.criticality ?? "Medium", options: O(LEVELS) }),
          F("templateId", "Default PM template", "select", { value: c?.templateId ?? "", options: [{ v: "", t: "None" }, ...(opt?.templates ?? []).map((t) => ({ v: t.id, t: t.name }))] }),
          F("warrantyType", "Default warranty type", "select", { value: c?.warrantyType ?? "", options: [{ v: "", t: "None" }, ...O(cfg?.wtypes ?? [])] }),
          F("lifeYears", "Expected useful life (years, reference)", "number", { value: c?.lifeYears ? String(c.lifeYears) : "" }),
          F("description", "Description", "area", { value: c?.description ?? "" }),
        ],
        onSubmit: async (v) => {
          await amApi.saveCategory(id, { name: sv(v, "name"), code: sv(v, "code"), parentId: sv(v, "parentId") || undefined, criticality: sv(v, "criticality"), templateId: sv(v, "templateId") || undefined, warrantyType: sv(v, "warrantyType") || undefined, lifeYears: nv(v, "lifeYears"), description: sv(v, "description") });
          await after("Category saved.");
        },
      });
    };
    const parentOpts = (except?: string) => [...(opt?.branches ?? []).map((b) => ({ v: `b:${b.id}`, t: `${b.name} (branch)` })), ...(opt?.locations ?? []).filter((l) => l.id !== except && l.status === "Active").map((l) => ({ v: `l:${l.id}`, t: l.path }))];
    const locationModal = (id: string | null, parent?: string) => {
      const l = id ? opt?.locations.find((x) => x.id === id) : null;
      modal({
        title: id ? "Edit location" : "Add location",
        note: "Branches are created in the Branches module and appear here automatically.",
        primaryT: "Save",
        fields: [
          F("name", "Name", "text", { req: true, value: l?.name ?? "", af: true }),
          F("code", "Code", "text", { req: true, value: l?.code ?? "" }),
          F("type", "Type", "select", { value: l?.type ?? "Room", options: O(["Site", "Building", "Floor", "Area", "Room", "Functional Position"]) }),
          F("parent", "Parent", "select", { req: true, value: l ? (l.parentId ? `l:${l.parentId}` : `b:${l.branchId}`) : (parent ?? ""), options: [{ v: "", t: "Pick a parent" }, ...parentOpts(id ?? undefined)] }),
        ],
        onSubmit: async (v) => {
          await amApi.saveLocation(id, { name: sv(v, "name"), code: sv(v, "code"), type: sv(v, "type"), parent: sv(v, "parent") });
          await after("Location saved.");
        },
      });
    };

    const rowAction = (b: string, rawId: string, v: string) => {
      const s = st.getState();
      const [id, rel] = split(rawId);
      if (["reg", "ov-risk", "ov-wty", "an-tbl"].includes(b)) return assetAct(id, v);
      if (b === "d-head") return assetAct(s.cur, v);
      if (b === "an-ai") {
        const aid = id.replace(/^in_[a-z]+_/, "");
        if (v === "Dismiss") return run(async () => (await amApi.dismiss(id), "Insight dismissed."));
        if (v === "Create request from insight") return requestModal({ assetId: aid, type: "Inspection Finding", title: "Follow-up from insight" });
        return assetAct(aid, v);
      }
      if (b === "ov-due") {
        if (v === "Generate work order") return pmAction(id, v);
        if (v === "Open plan") return open("pm", id);
        return rel ? go("detail", rel) : undefined;
      }
      if (b === "ov-rec") return v === "Open asset" && rel ? go("detail", rel) : open("wo", id);
      if (b === "rq") return reqAction(id, v);
      if (b === "wo") return woAction(id, v);
      if (b === "pm") return pmAction(id, v);
      if (b === "hist") {
        const [t, rid] = [id.slice(0, 2), id.slice(3)];
        if (v === "Correct reading") return correctModal(rid);
        if (v === "Open asset") return rel ? go("detail", rel) : undefined;
        if (t === "ev") return open("hist", rid);
        if (t === "dt") return open("list", `down:${rel}`);
        if (rel) {
          st.getState().set((x) => ({ seg: { ...x.seg, d: "meter" } }));
          return go("detail", rel);
        }
        return;
      }
      if (b === "d-maint") {
        const [t, rid] = [id.slice(0, 2), id.slice(3)];
        return open(t === "rq" ? "req" : t === "wo" ? "wo" : "pm", rid);
      }
      if (b === "d-insp") return v === "Create follow-up request" ? requestModal({ assetId: s.cur, type: "Inspection Finding", title: "Follow-up from inspection" }) : open("hist", id);
      if (b === "d-meter") return correctModal(id);
      if (b === "d-down") {
        if (v === "End downtime") return confirm("End downtime now?", "Records the end time as now.", "End downtime", async () => (await amApi.downEnd(id), "Downtime ended."));
        return rel ? open("wo", rel) : undefined;
      }
      if (b === "d-costs") return open("wo", id.split(":")[0], "costs");
      if (b === "d-docs") {
        if (v === "Remove") return confirm("Remove document?", "The file is deleted from storage. The audit keeps a record.", "Remove", async () => (await amApi.docDel(id), "Document removed."), { danger: true });
        return run(async () => {
          const r = await amApi.docUrl(id);
          window.open(r.url, "_blank", "noopener");
          return `Opening ${r.name}.`;
        });
      }
      if (b === "tx-cat") {
        if (v === "Edit") return categoryModal(id);
        if (v === "View assets") {
          st.getState().set({ f: { ...s.f, reg: { cat: id } }, page: {} });
          return go("register");
        }
        if (v === "Merge into…")
          return modal({ title: "Merge category into…", sub: "Assets are reassigned to the target; the source becomes inactive (kept for history).", primaryT: "Merge", pBg: "#B42318", fields: [F("to", "Target", "select", { req: true, options: (opt?.categories ?? []).filter((x) => x.id !== id).map((x) => ({ v: x.id, t: x.name })) })], onSubmit: async (x) => { await amApi.catAction(id, "Merge", sv(x, "to")); await after("Merged. Source kept as inactive for history."); } });
        if (v === "Delete") return confirm("Delete category?", "Only categories nothing references can be deleted.", "Delete", async () => (await amApi.catAction(id, "Delete"), "Category deleted."), { danger: true });
        return run(async () => (await amApi.catAction(id, v), `Category ${v.toLowerCase()}d.`));
      }
      if (b === "tx-loc") {
        const [k, lid] = [id.slice(0, 1), id.slice(2)];
        if (v === "View assets") {
          st.getState().set({ f: { ...s.f, reg: { loc: k === "b" ? `b:${lid}` : lid } }, page: {} });
          return go("register");
        }
        if (v === "Add child location") return locationModal(null, `${k}:${lid}`);
        if (v === "Open in Branches") return router.push("/branches");
        if (v === "Edit") return locationModal(lid);
        if (v === "Move")
          return modal({ title: "Move location", sub: "Child locations and their assets move with it.", primaryT: "Move", fields: [F("to", "New parent", "select", { req: true, options: parentOpts(lid) })], onSubmit: async (x) => { const r = await amApi.locAction(lid, "Move", sv(x, "to")); await after(`Moved ${r.moved ?? 1} location(s). Child locations and assets follow.`); } });
        if (v === "Merge into…")
          return modal({ title: "Merge location into…", sub: "Assets and child locations move to the target; the source becomes inactive.", primaryT: "Merge", pBg: "#B42318", fields: [F("to", "Target", "select", { req: true, options: locOpts(lid) })], onSubmit: async (x) => { await amApi.locAction(lid, "Merge", sv(x, "to")); await after("Merged."); } });
        return run(async () => (await amApi.locAction(lid, v), `Location ${v.toLowerCase()}d.`));
      }
      if (b === "tx-cf") return confirm("Remove field?", "Values already saved on assets are kept for history.", "Remove", async () => (await amApi.delField(id), "Field removed."), { danger: true });
    };

    const kpiClick = (k: string) => {
      const s = st.getState();
      const reg = (f: Record<string, string>) => {
        st.getState().set({ f: { ...s.f, reg: f }, page: {} });
        go("register");
      };
      if (k === "k-active" || k === "r-all") return reg({});
      if (k === "k-crit" || k === "r-crit") return reg({ crit: "Critical" });
      if (["r-Active", "r-Under Maintenance", "r-Out of Service"].includes(k)) return reg({ st: k.slice(2) });
      if (k === "r-cust") return reg({ owner: "Customer-owned" });
      if (k === "r-wty") return reg({ wty: "Expiring 90d" });
      if (["k-wty", "r-noloc", "k-due", "k-od", "k-down", "k-cost", "a-cost", "k-health", "a-rep", "a-ratio", "a-pmc"].includes(k)) return open("list", k);
      if (k === "k-req") return go("requests");
      if (k === "k-wo") {
        st.getState().set({ f: { ...s.f, wo: { st: "open" } } });
        return go("workorders");
      }
      if (k.startsWith("dk-")) return st.getState().set({ seg: { ...s.seg, d: ({ "dk-cond": "insp", "dk-st": "tl", "dk-next": "maint", "dk-last": "maint", "dk-meter": "meter", "dk-down": "down", "dk-cost": "costs", "dk-wty": "docs" } as Record<string, string>)[k] } });
      if (k.startsWith("q-")) {
        const x = k.slice(2);
        return st.getState().set({ f: { ...s.f, rq: { st: ["open", "crit", "safe", "tt"].includes(x) ? "open" : x, pri: x === "crit" ? "Critical" : "", safety: x === "safe" ? "1" : "" } } });
      }
      if (k.startsWith("w-")) {
        const x = k.slice(2);
        return st.getState().set({ f: { ...s.f, wo: { st: x === "avg" ? "Closed" : x === "Completed" ? "Completed" : x } } });
      }
      if (k.startsWith("p-")) return st.getState().set({ seg: { ...s.seg, pm: k === "p-7" || k === "p-today" ? "cal" : "list" } });
      if (k.startsWith("h-")) {
        const type = ({ "h-insp": "Inspection", "h-fail": "Inspection", "h-cond": "Condition Change", "h-read": "Reading", "h-wty": "Warranty Service" } as Record<string, string>)[k] ?? "";
        return st.getState().set({ f: { ...s.f, hist: { type, result: k === "h-fail" ? "Fail" : "", days: ["h-insp", "h-fail", "h-cond", "h-svc", "h-read"].includes(k) ? "30" : "" } } });
      }
      if (["a-down", "a-un", "a-pl", "a-avail", "a-crel", "a-mttr", "a-mtbf"].includes(k)) {
        if (k === "a-un" || k === "a-pl") st.getState().set({ f: { ...s.f, an: { ...(s.f.an ?? {}), pu: k === "a-un" ? "Unplanned" : "Planned" } } });
        return open("list", "down:all");
      }
    };

    const bulkModal = (act: string) => {
      const s = st.getState();
      const label = ({ "bk-loc": "Assign location", "bk-cat": "Assign category", "bk-crit": "Change criticality", "bk-team": "Assign team", "bk-pm": "Apply PM template", "bk-arch": "Archive" } as Record<string, string>)[act];
      const fields: AField[] =
        act === "bk-loc"
          ? [F("v", "Location", "select", { options: locOpts() })]
          : act === "bk-cat"
            ? [F("v", "Category", "select", { options: catOpts().slice(1) })]
            : act === "bk-crit"
              ? [F("v", "Criticality", "select", { options: O(LEVELS) }), F("reason", "Reason", "text", { req: true })]
              : act === "bk-team"
                ? [F("v", "Team", "select", { options: (opt?.teams ?? []).map((t) => ({ v: t.id, t: t.name })) })]
                : act === "bk-pm"
                  ? [F("v", "PM template", "select", { options: (opt?.templates ?? []).map((t) => ({ v: t.id, t: t.name })) }), F("int", "Every (months)", "number", { value: "3" })]
                  : [F("reason", "Reason", "text", { req: true })];
      modal({
        title: `${label} · ${s.sel.length} asset(s)`,
        sub: `Affected: ${s.sel.map((i) => opt?.assets.find((a) => a.id === i)?.number ?? i).join(", ")}`,
        primaryT: `Apply to ${s.sel.length}`,
        pBg: act === "bk-arch" ? "#B42318" : "#12A150",
        note: act === "bk-arch" ? "Archived assets keep full history and can’t return to Active. Only retired, disposed, inactive, draft or lost assets can be archived." : act === "bk-crit" ? "Criticality changes affect priority, alerts and approvals." : null,
        fields,
        onSubmit: async (v) => {
          const r = await amApi.bulk({ ids: s.sel, act, value: sv(v, "v") || undefined, reason: sv(v, "reason") || undefined, interval: nv(v, "int") ?? undefined });
          st.getState().set({ sel: [] });
          await after(`${label} applied to ${r.applied} asset(s).${r.skipped.length ? ` Skipped ${r.skipped.join(", ")}.` : ""}`);
        },
      });
    };

    const importModal = () =>
      modal({
        title: "Import assets",
        sub: "Upload → validate → review duplicates → import. Existing assets are never overwritten. Columns: Asset name (required), Number, Tag, Serial, Barcode, Manufacturer, Model, Category, Location, Branch, Condition, Criticality, Status, Owner type, Purchase date, Install date, Purchase cost, Warranty provider, Warranty type, Warranty expiry, Meter type.",
        primaryT: "Validate file",
        fields: [F("file", "CSV / XLSX file", "file", { req: true, accept: ".csv,.xlsx" })],
        onSubmit: async (v) => {
          const file = v.file as File;
          const p = await amApi.importPreview(file);
          const lines = [
            `Rows: ${p.summary.total}`,
            `✓ ${p.summary.ready} new asset(s) ready`,
            `↻ ${p.summary.held} match existing assets — held for review (not overwritten)`,
            `✕ ${p.summary.failed} failed`,
            `– ${p.summary.blank} blank`,
            "",
            `Columns mapped: ${p.summary.mapped.join(", ") || "—"}${p.summary.ignored.length ? `\nIgnored columns: ${p.summary.ignored.join(", ")}` : ""}`,
            ...p.rows.filter((r) => r.status === "error" || r.status === "match").slice(0, 12).map((r) => `Row ${r.row}: ${r.why}`),
          ].join("\n");
          modal({
            title: "Import preview",
            primaryT: p.summary.ready ? `Import ${p.summary.ready} new asset(s)` : "Close",
            fields: [F("r", "Validation", "read", { value: lines })],
            onSubmit: async () => {
              if (!p.summary.ready) return;
              const r = await amApi.importCommit(file);
              await after(`Imported ${r.created.length} asset(s).${r.failed.length ? ` ${r.failed.length} failed.` : ""}`);
            },
          });
          return "keep";
        },
      });

    const exportModal = () => {
      const s = st.getState();
      modal({
        title: "Export",
        sub: R?.cost ? "Exports are logged." : "Exports are logged. Cost columns are excluded for your role.",
        primaryT: "Download",
        fields: [
          F("what", "What", "select", { value: s.tab === "workorders" ? "workorders" : s.tab === "analytics" ? "analytics" : s.tab === "history" ? "history" : "register", options: O([["register", "Asset register (current filters)"], ["workorders", "Work orders"], ["analytics", "Reliability & downtime"], ["history", "Inspections & history"]]) }),
          F("fmt", "Format", "select", { options: O([["csv", "CSV"], ["xlsx", "XLSX"]]) }),
        ],
        onSubmit: async (v) => {
          const name = await amDownload(amScopeOf(st.getState()), sv(v, "what"), sv(v, "fmt"));
          await after(`Downloaded ${name}.`);
        },
      });
    };

    const scanModal = () =>
      modal({
        title: "Scan QR / barcode",
        sub: "Point the camera at an asset QR label or barcode — or type the tag, serial, barcode or asset number.",
        primaryT: "Find asset",
        fields: [F("cam", "Camera", "camera", { target: "code" }), F("code", "Code", "text", { req: true, ph: "Asset QR link, barcode, tag, serial or number" })],
        onSubmit: async (v) => {
          const a = await amApi.lookup(sv(v, "code"));
          st.getState().closeModal();
          go("detail", a.id);
        },
      });

    const top = (k: string) => {
      const s = st.getState();
      if (k === "add") return void assetModal();
      if (k === "import") return importModal();
      if (k === "scan") return scanModal();
      if (k === "export") return exportModal();
      if (k === "audit") return open("audit", "_");
      if (k === "fresh") return open("fresh", "_");
      if (k === "newreq") return requestModal(s.tab === "detail" ? { assetId: s.cur } : {});
      if (k === "newwo") return woModal(s.tab === "detail" ? s.cur : undefined);
      if (k === "newpm") return void planModal(null, s.tab === "detail" ? s.cur : undefined);
      if (k === "inspect") return inspectModal(s.tab === "detail" ? s.cur : undefined);
      if (k === "reading") return readingModal(s.tab === "detail" ? s.cur : undefined);
      if (k === "service") return serviceModal();
      if (k === "toreg") return go("register");
      if (k === "refresh") return void after("Refreshed — KPIs recalculated from the records.");
      if (k === "saveview")
        return modal({ title: "Save current view", primaryT: "Save view", fields: [F("name", "View name", "text", { req: true, af: true })], onSubmit: async (v) => { await amApi.saveView(sv(v, "name"), { ...(s.f.reg ?? {}), view: undefined } as Record<string, unknown>); await after("View saved."); } });
    };

    const blockAct = (k: string) => {
      const s = st.getState();
      if (k.startsWith("band:")) {
        st.getState().set({ f: { ...s.f, reg: { health: k.slice(5) } }, page: {} });
        return go("register");
      }
      if (k === "to-analytics") {
        st.getState().set({ f: { ...s.f, an: {} } });
        return go("analytics");
      }
      if (k.startsWith("dd:")) return open("list", k === "dd:all" ? "down:all" : `down:${k.slice(3)}`);
      if (k === "toggleArch") return st.getState().set({ arch: !s.arch });
      if (k === "techAll") return st.getState().set({ techAll: !s.techAll });
      if (k === "pm-run") return run(async () => { const r = await amApi.evaluate(); return `PM Due Evaluator: ${r.made.length} work order(s) created${r.made.length ? ` (${r.made.join(", ")})` : ""} · ${r.skipped.length} already generated for this due instance (skipped).`; });
      if (k === "d-openwo") return st.getState().set({ seg: { ...s.seg, d: "maint" } });
      if (k === "d-req") return requestModal({ assetId: s.cur });
      if (k === "d-edit") return void assetModal(s.cur);
      if (k === "d-read") return readingModal(s.cur);
      if (k === "d-sched") return void planModal(null, s.cur);
      if (k === "d-wo") return woModal(s.cur);
      if (k === "d-down") return downtimeModal(s.cur);
      if (k === "d-doc") return docModal(s.cur);
      if (k === "cat-new") return categoryModal(null);
      if (k === "loc-new") return locationModal(null);
      if (k === "cf-new") return fieldModal();
      if (k.startsWith("bk-")) return bulkModal(k);
      if (k === "rclear") return st.getState().set({ f: { ...s.f, reg: {} }, page: {} });
      if (k === "qclear") return st.getState().set({ f: { ...s.f, rq: { st: "" } } });
      if (k === "wclear") return st.getState().set({ f: { ...s.f, wo: { st: "" } } });
      if (k === "hclear") return st.getState().set({ f: { ...s.f, hist: {} } });
      return top(k);
    };

    const fieldModal = () =>
      modal({
        title: "Add custom field",
        primaryT: "Add field",
        fields: [
          F("name", "Field name", "text", { req: true, af: true }),
          F("type", "Type", "select", { options: O(["Text", "Number", "Date", "Dropdown", "Yes/No", "Staff reference"]) }),
          F("options", "Dropdown options (one per line)", "area"),
          F("cats", "Applies to (none = all categories)", "checks", { options: (opt?.categories ?? []).map((c) => ({ v: c.id, t: c.name })) }),
        ],
        onSubmit: async (v) => {
          await amApi.addField({ name: sv(v, "name"), type: sv(v, "type"), options: sv(v, "options").split("\n").filter(Boolean), categoryIds: v.cats as string[] });
          await after("Field added.");
        },
      });

    const settingsBtn = (k: string, saved?: Record<string, unknown>) => {
      if (k.startsWith("opt-add:")) {
        const path = `config.${k.slice(8)}`;
        return modal({
          title: "Add option",
          primaryT: "Add",
          fields: [F("v", "Option", "text", { req: true, af: true })],
          onSubmit: async (v) => {
            const d0 = st.getState().draft;
            const d = Object.keys(d0).length ? d0 : (JSON.parse(JSON.stringify(saved ?? {})) as Record<string, unknown>);
            const cur = (getPath(d, path) as string[] | undefined) ?? [];
            if (cur.includes(sv(v, "v"))) return "That option already exists.";
            st.getState().set({ draft: setPath(d, path, [...cur, sv(v, "v")]) });
          },
        });
      }
      if (k === "cf-new") return fieldModal();
      if (k.startsWith("cf-del:")) return confirm("Remove field?", "Values already saved on assets are kept for history.", "Remove", async () => (await amApi.delField(k.slice(7)), "Field removed."), { danger: true });
      if (k === "team-new" || k.startsWith("team-edit:")) {
        const t = k.startsWith("team-edit:") ? opt?.teams.find((x) => x.id === k.slice(10)) : null;
        return modal({ title: t ? "Edit team" : "Add maintenance team", primaryT: "Save", fields: [F("name", "Team name", "text", { req: true, af: true, value: t?.name ?? "" }), F("members", "Members", "checks", { options: (opt?.people ?? []).map((p) => ({ v: p.id, t: `${p.name} · ${p.role}`, on: t?.members.includes(p.id) })) })], onSubmit: async (v) => { await amApi.saveTeam(t?.id ?? null, { name: sv(v, "name"), members: v.members as string[] }); await after("Team saved."); } });
      }
      if (k.startsWith("team-del:")) return confirm("Remove team?", "Only teams with no assets, open work orders or plans can be removed.", "Remove", async () => (await amApi.delTeam(k.slice(9)), "Team removed."), { danger: true });
      if (k === "tpl-new" || k.startsWith("tpl-edit:")) {
        const t = k.startsWith("tpl-edit:") ? opt?.templates.find((x) => x.id === k.slice(9)) : null;
        return modal({ title: t ? "Edit PM template" : "Add PM template", primaryT: "Save", fields: [F("name", "Template name", "text", { req: true, af: true, value: t?.name ?? "" }), F("checklist", "Checklist (one step per line)", "area", { rows: 6, value: (t?.checklist ?? []).join("\n") })], onSubmit: async (v) => { await amApi.saveTemplate(t?.id ?? null, { name: sv(v, "name"), checklist: sv(v, "checklist").split("\n").filter(Boolean) }); await after("Template saved."); } });
      }
      if (k.startsWith("tpl-del:")) return confirm("Remove template?", "Templates used by active plans can’t be removed.", "Remove", async () => (await amApi.delTemplate(k.slice(8)), "Template removed."), { danger: true });
    };

    const drawerAct = (k: string, kind: string, id: string, dv?: AmDrawer) => {
      if (k === "dr-open") return go("detail", id);
      if (k === "dr-sched") return void planModal(null, id);
      if (k === "dr-refresh") return void after("Refreshed.");
      if (k.startsWith("ra:")) return reqAction(id, k.slice(3));
      if (k.startsWith("wa:")) return woAction(id, k.slice(3));
      if (k === "pm-gen") return pmAction(id, "Generate work order");
      if (k === "pm-resched") return pmAction(id, "Reschedule");
      if (k === "h-follow") return requestModal({ assetId: dv?.ctxId, type: "Inspection Finding", title: `Follow-up: ${(dv?.follow ?? "").slice(0, 120)}` });
    };

    const onItem = (_kind: string, item: AmItem, mode: "check" | "return" | "bill") => {
      const dr = st.getState().drawer;
      if (!dr || !item.id) return;
      if (mode === "check") return run(async () => (await amApi.check(dr.id, item.id!), "Checklist updated."));
      if (mode === "return")
        return modal({ title: `Return ${item.a} to stock`, sub: "Adds the quantity back to Inventory and reverses its cost.", primaryT: "Return", fields: [F("qty", "Quantity", "number", { req: true, value: "1" })], onSubmit: async (v) => { await amApi.returnPart(dr.id, item.id!, Number(sv(v, "qty"))); await after("Returned to stock."); } });
      return modal({ title: "Link Finance bill", sub: "Vendor and other costs link to a bill already in Finance — the bill posts the expense, so nothing is double-counted.", primaryT: "Save", fields: [F("bill", "Bill", "select", { options: [{ v: "", t: "Not billed yet" }, ...(opt?.finBills ?? []).map((x) => ({ v: x.id, t: x.label }))] })], onSubmit: async (v) => { await amApi.billLink(item.id!, sv(v, "bill") || null); await after("Bill link saved."); } });
    };

    const handlers: Omit<RenderHandlers, "sel"> = {
      kpiClick,
      blockAct,
      segPick: (b, k) => {
        const s = st.getState();
        const key = b === "ov-due" ? "ovDue" : b === "ov-wty" ? "ovW" : b === "reg" ? "reg" : b.startsWith("d-") ? "d" : b.startsWith("tx-") ? "tx" : b === "wo" ? "wo" : b.startsWith("pm") ? "pm" : b;
        st.getState().set({ seg: { ...s.seg, [key]: k } });
      },
      setQ: (b, v) => {
        const s = st.getState();
        const fk = b === "reg" || b === "rq" || b === "wo" || b === "hist" ? b : null;
        if (fk) st.getState().set({ f: { ...s.f, [fk]: { ...(s.f[fk] ?? {}), q: v } }, page: { ...s.page, reg: 0 } });
      },
      setF: (b, k, v) => {
        const s = st.getState();
        if (k === "__more") return v ? rowAction("d-head", s.cur, v) : undefined;
        if (b === "reg") {
          if (k === "__sort") return st.getState().set({ sort: v });
          if (k === "view") {
            if (!v) return st.getState().set({ f: { ...s.f, reg: {} }, page: {} });
            return void amApi.getView(v).then((x) => st.getState().set({ f: { ...s.f, reg: { ...(x.filters ?? {}), view: v } }, page: {} })).catch((e) => flash(errText(e)));
          }
          return st.getState().set({ f: { ...s.f, reg: { ...(s.f.reg ?? {}), [k]: v, view: "" } }, page: {}, sel: [] });
        }
        if (b === "an-f") {
          if (k === "period") return st.getState().set({ period: v });
          return st.getState().set({ f: { ...s.f, an: { ...(s.f.an ?? {}), [k]: v } } });
        }
        if (b === "rq" || b === "wo" || b === "hist") st.getState().set({ f: { ...s.f, [b]: { ...(s.f[b] ?? {}), [k]: v } } });
      },
      clearF: (b) => {
        const s = st.getState();
        const fk = b === "an-f" ? "an" : b;
        st.getState().set({ f: { ...s.f, [fk]: b === "rq" || b === "wo" ? { st: "" } : {} }, page: {} });
      },
      pageGo: (d) => st.getState().set((s) => ({ page: { ...s.page, reg: Math.max(0, (s.page.reg ?? 0) + d) } })),
      selRow: (id) => st.getState().set((s) => ({ sel: s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id] })),
      selAll: (ids) => st.getState().set({ sel: ids }),
      rowOpen: (b, id) => {
        const def: Record<string, string> = { reg: "Open", "ov-risk": "Open asset", "ov-wty": "Open asset", "an-tbl": "Open asset", "an-ai": "Open asset", "ov-due": "Open plan", "ov-rec": "View", rq: "View", wo: "View", pm: "View", hist: "View", "d-maint": "Open", "d-insp": "View", "d-down": "Open work order", "d-costs": "Open", "tx-cat": "View assets", "tx-loc": "View assets", "d-docs": "Download" };
        if (def[b]) rowAction(b, id, def[b]);
      },
      rowAct: (b, id, v) => rowAction(b, id, v),
      cardOpen: () => undefined,
      calOpen: (_b, id) => open("pm", id),
    };

    return { handlers, top, drawerAct, onItem, settingsBtn, after, flash, run, go };
  }, [opt, qc, router]);
}
