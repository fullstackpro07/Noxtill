"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { ppApi, type PpDrawer, type PpOptions } from "@/lib/people-api";
import type { RenderHandlers } from "@/components/payments/pay-render";
import type { AField, AModal, AValues } from "@/components/assets/am-store";
import { ppScopeOf, usePp } from "./pp-store";

export const PP_PATH: Record<string, string> = {
  overview: "",
  recruitment: "/recruitment",
  jobs: "/jobs",
  applicants: "/applicants",
  interviews: "/interviews",
  offers: "/offers",
  onboarding: "/onboarding",
  leave: "/leave",
  payroll: "/payroll",
  runs: "/payroll/runs",
  payslips: "/payslips",
  benefits: "/benefits",
  performance: "/performance",
  training: "/training",
  offboarding: "/offboarding",
};
export const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

const F = (name: string, label: string, type: AField["type"] = "text", o: Partial<AField> = {}): AField => ({ name, label, type, ...o });
const O = (a: (string | [string, string])[]) => a.map((x) => (typeof x === "string" ? { v: x, t: x } : { v: x[0], t: x[1] }));
const sv = (v: AValues, k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
const arr = (v: AValues, k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
const plus = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const FK: Record<string, string> = { "ov-f": "ov", job: "job", "app-f": "app", app: "app", int: "int", off: "off", lv: "lv", "pr-emp": "pr", ps: "ps", tr: "tr" };
const VK: Record<string, string> = { "app-f": "appView", app: "appView", int: "intView", "int-sc": "intView", lv: "lvView", "lv-b": "lvView", "lv-t": "lvView", "lv-cal": "lvView", "run-h": "runTab", ben: "benView", "ben-a": "benView", "ben-h": "benView", pf: "perfView", "pf-g": "perfView", "pf-c": "perfView", tr: "trView", "tr-c": "trView", "tr-m": "trView" };
const RECS = ["Strong hire", "Hire", "No hire", "Strong no hire"];
const REJ = ["Experience below requirement", "Skills test not passed", "Availability mismatch", "Compensation mismatch", "Position filled", "Other"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const label = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${months[m - 1]?.slice(0, 3) ?? ""} ${y}`;
};

type JobRef = Record<string, string | number | null>;

export function usePpActions(opt: PpOptions | undefined) {
  const router = useRouter();
  const qc = useQueryClient();
  return useMemo(() => {
    const st = usePp;
    const R = opt?.rights;
    const flash = (t: string) => st.getState().flash(t);
    const modal = (m: AModal) => st.getState().openModal(m);
    const refresh = () => qc.invalidateQueries({ queryKey: ["pp"] });
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
    const scope = () => ppScopeOf(st.getState());
    const ref = async <T,>(kind: string, id: string) => (await ppApi.drawer(kind, id, scope())).ref as T;
    const go = (tab: string, filt?: Record<string, string>, view?: Record<string, string>) => {
      const s = st.getState();
      const fk = ({ overview: "ov", jobs: "job", applicants: "app", interviews: "int", offers: "off", leave: "lv", payroll: "pr", payslips: "ps", training: "tr" } as Record<string, string>)[tab];
      st.getState().set({ drawer: null, sel: [], page: {}, ...(filt && fk ? { f: { ...s.f, [fk]: filt } } : {}), ...(view ? { view: { ...s.view, ...view } } : {}) });
      router.push(`/people${PP_PATH[tab] ?? ""}`);
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    };
    const reason = (title: string, lbl: string, primaryT: string, fn: (r: string) => Promise<string>, o: { danger?: boolean; dark?: boolean; sub?: string; req?: boolean; note?: string } = {}) =>
      modal({ title, sub: o.sub, note: o.note, primaryT, pBg: o.danger ? "#B42318" : o.dark ? "#0A1B2A" : "#12A150", fields: [F("reason", lbl, "text", { req: o.req !== false, af: true })], onSubmit: async (v) => void (await after(await fn(sv(v, "reason")))) });
    const confirm = (title: string, sub: string, primaryT: string, fn: () => Promise<string>, danger = false) => modal({ title, sub, primaryT, pBg: danger ? "#B42318" : "#12A150", fields: [], onSubmit: async () => void (await after(await fn())) });
    const pick = (title: string, lbl: string, options: { v: string; t: string }[], fn: (v: string) => Promise<string>, o: { note?: string } = {}) =>
      modal({ title, note: o.note, primaryT: "Confirm", fields: [F("v", lbl, "select", { req: true, options: [{ v: "", t: "Choose…" }, ...options] })], onSubmit: async (v) => void (await after(await fn(sv(v, "v")))) });
    const members = () => opt?.members ?? [];
    const memberOpts = (blank = "") => [...(blank ? [{ v: "", t: blank }] : []), ...members().map((m) => ({ v: m.v, t: m.t }))];
    const today = opt?.today ?? new Date().toISOString().slice(0, 10);
    const openUrl = (url: string) => window.open(url, "_blank", "noopener");
    const dl = (fn: () => Promise<{ url: string; name?: string | null }>, what = "File") =>
      fn()
        .then((r) => {
          openUrl(r.url);
          flash(`${what} opened via a short-lived signed link${r.name ? ` (${r.name})` : ""}.`);
        })
        .catch((e) => flash(errText(e)));
    const need = (ok: boolean | undefined, what: string) => {
      if (ok) return true;
      flash(`PERMISSION_DENIED — ${what} isn’t part of your role.`);
      return false;
    };

    // ── employees ─────────────────────────────────────────────────────────
    const profileModal = async (uid: string) => {
      const p = await ppApi.profile(uid);
      const c = p.can;
      const fields: AField[] = [
        ...(c.employment
          ? [
              F("department", "Department", "text", { value: p.department, help: opt?.depts.length ? `In use: ${opt.depts.join(", ")}` : undefined }),
              F("title", "Job title", "text", { value: p.title }),
              F("employmentType", "Employment type", "select", { value: p.employmentType, options: O(opt?.lists.empTypes ?? []) }),
              F("managerUserId", "Line manager", "select", { value: p.managerUserId, options: memberOpts("No manager").filter((m) => m.v !== uid) }),
              F("startDate", "Start date", "date", { value: p.startDate }),
              F("probationEnd", "Probation ends", "date", { value: p.probationEnd }),
              F("contractEnd", "Contract ends", "date", { value: p.contractEnd }),
              F("status", "Status", "select", { value: p.status === "Exited" ? "Active" : p.status, options: O(["Active", "Probation", "Notice"]) }),
            ]
          : []),
        ...(c.pay
          ? [
              F("payBasis", "Pay basis", "select", { value: p.payBasis ?? "", options: [{ v: "", t: "Not set" }, ...O(opt?.lists.basis ?? [])] }),
              F("monthlySalary", `Monthly salary (${opt?.currency ?? ""}) — Salaried`, "number", { value: p.monthlySalary == null ? "" : String(p.monthlySalary) }),
              F("hourlyRate", `Hourly rate (${opt?.currency ?? ""}) — Hourly (kept on the Staff record)`, "number", { value: p.hourlyRate == null ? "" : String(p.hourlyRate) }),
              F("inPayroll", "Include in payroll", "select", { value: p.inPayroll ? "1" : "", options: O([["1", "Yes"], ["", "No"]]) }),
            ]
          : []),
        ...(c.bank
          ? [
              F("bankName", "Bank", "text", { value: p.bankName ?? "" }),
              F("bankAccount", "Account number / IBAN", "text", { ph: p.bankMask ? `On file ${p.bankMask} — leave blank to keep` : "Not on file", help: "Stored encrypted; only the last 4 digits are ever shown." }),
              F("bankTitle", "Account title", "text", { value: p.bankTitle ?? "" }),
            ]
          : []),
        ...(c.tax
          ? [
              F("taxStatus", "Tax status", "select", { value: p.taxStatus ?? "", options: [{ v: "", t: "Not set" }, ...O(opt?.lists.taxStatus ?? [])] }),
              F("taxId", "Tax ID", "text", { ph: p.taxMask ? `On file ${p.taxMask} — leave blank to keep` : "Not on file", help: "Stored encrypted." }),
            ]
          : []),
      ];
      modal({
        title: `${uid === opt?.me.uid ? "My payroll profile" : "Employment & payroll profile"} · ${p.name}`,
        sub: p.version ? `Profile v${p.version}. Changes are audited.` : "No profile yet — saving creates it.",
        primaryT: "Save profile",
        wide: true,
        fields,
        onSubmit: async (v) => {
          const b: Record<string, unknown> = { expectedVersion: p.version || undefined };
          for (const f of fields) {
            const x = sv(v, f.name);
            if ((f.name === "bankAccount" || f.name === "taxId") && !x) continue;
            b[f.name] = f.name === "inPayroll" ? x === "1" : x === "" && ["managerUserId", "startDate", "probationEnd", "contractEnd", "monthlySalary", "hourlyRate", "taxStatus"].includes(f.name) ? null : x;
          }
          const r = await ppApi.saveProfile(uid, b);
          await after(`Profile saved (v${r.version}) · ${r.changed.join(", ")}.`);
        },
      });
    };

    // ── recruitment ───────────────────────────────────────────────────────
    const jobModal = async (id?: string) => {
      const j: JobRef = id ? await ref<JobRef>("job", id) : { title: "", department: opt?.depts[0] ?? "", branchId: "", workMode: "On-site", employmentType: "Full-time", target: 1, managerUserId: "", compMin: "", compMax: "", reason: "", budgetRef: "", description: "", targetDays: 30 };
      const s = (k: string) => (j[k] == null ? "" : String(j[k]));
      modal({
        title: id ? `Edit ${s("title")}` : "New vacancy",
        primaryT: id ? "Save changes" : "Save as draft",
        wide: true,
        fields: [
          F("title", "Job title", "text", { req: true, af: true, value: s("title") }),
          F("department", "Department", "text", { req: true, value: s("department"), help: opt?.depts.length ? `In use: ${opt.depts.join(", ")}` : undefined }),
          F("branchId", "Location", "select", { value: s("branchId"), options: [{ v: "", t: "Not branch-specific" }, ...(opt?.branches ?? [])] }),
          F("workMode", "Work mode", "select", { value: s("workMode"), options: O(opt?.lists.workModes ?? []) }),
          F("employmentType", "Employment type", "select", { value: s("employmentType"), options: O(opt?.lists.empTypes ?? []) }),
          F("target", "Headcount target", "number", { value: s("target") }),
          F("managerUserId", "Hiring manager", "select", { value: s("managerUserId"), options: memberOpts("Choose…") }),
          ...(R?.comp || R?.salary ? [F("compMin", `Compensation min (${opt?.currency}/month) — restricted`, "number", { value: s("compMin") }), F("compMax", `Compensation max (${opt?.currency}/month) — restricted`, "number", { value: s("compMax") })] : []),
          F("reason", "Opening reason", "text", { value: s("reason") }),
          F("budgetRef", "Budget approval reference (Finance)", "text", { value: s("budgetRef") }),
          F("description", "Public description", "area", { rows: 5, value: s("description") }),
          F("targetDays", "Target days to hire", "number", { value: s("targetDays") }),
        ],
        note: id && ["Open", "Published"].includes(String(j.status)) ? "Changing the compensation range sends an approved vacancy back for approval (and unpublishes it)." : null,
        onSubmit: async (v) => {
          const b: Record<string, unknown> = { title: sv(v, "title"), department: sv(v, "department"), branchId: sv(v, "branchId") || null, workMode: sv(v, "workMode"), employmentType: sv(v, "employmentType"), target: sv(v, "target"), managerUserId: sv(v, "managerUserId") || null, reason: sv(v, "reason"), budgetRef: sv(v, "budgetRef"), description: sv(v, "description"), targetDays: sv(v, "targetDays") };
          if (R?.comp || R?.salary) Object.assign(b, { compMin: sv(v, "compMin"), compMax: sv(v, "compMax") });
          if (id) {
            const r = await ppApi.editJob(id, { ...b, expectedVersion: j.version });
            return void (await after(r.reapprove ? "Saved — compensation changed, so the vacancy is back in Awaiting Approval." : "Vacancy saved."));
          }
          const r = await ppApi.createJob(b);
          await after(`${r.number} created as a draft. Add a budget reference, then submit it for approval.`);
        },
      });
    };
    const jobAct = async (id: string, a: string) => {
      if (a === "Open job") return open("job", id);
      if (a === "View applicants") return go("applicants", { job: id });
      if (a === "Add candidate") return candModal({ job: id });
      if (a === "Schedule interview") return schedModal();
      if (a === "Create offer") return offerWizard(0, {});
      if (a === "Edit") return jobModal(id);
      if (a === "Submit for approval") return run(async () => `Status: ${(await ppApi.jobAct(id, "submit")).status}.`);
      if (a === "Approve") return run(async () => ((await ppApi.jobAct(id, "approve")), "Vacancy approved — it’s Open. Publish it to the careers page when ready."));
      if (a === "Publish") {
        const j = await ref<JobRef>("job", id);
        if (!opt?.careers) return flash("NOT_CONFIGURED — turn on the public careers page in More… › Settings · Recruiting & careers first.");
        return modal({
          title: `Publish ${String(j.title)}`,
          sub: `Public page · /careers/${opt.careers.slug}`,
          primaryT: "Publish",
          fields: [F("pv", "What candidates see", "read", { value: `${String(j.title)}\n${String(j.workMode)} · ${String(j.employmentType)}\n\n${String(j.description || "No description yet.")}\n\nNot shown: budget ref, internal notes, approval comments.` }), F("showcomp", "Show salary range publicly", "select", { options: O([["", "No"], ["showcomp", "Yes — intentionally public"]]) })],
          onSubmit: async (v) => void (await after(((await ppApi.jobAct(id, "publish", sv(v, "showcomp"))), `Published on /careers/${opt.careers!.slug}${sv(v, "showcomp") ? " with the salary range" : ""}.`))),
        });
      }
      if (a === "Unpublish") return run(async () => ((await ppApi.jobAct(id, "unpublish")), "Removed from the careers page."));
      if (a === "Pause") return reason("Pause vacancy", "Reason", "Pause", async (r) => ((await ppApi.jobAct(id, "pause", r)), "Vacancy on hold."));
      if (a === "Resume") return run(async () => ((await ppApi.jobAct(id, "resume")), "Vacancy reopened."));
      if (a === "Close") return reason("Close vacancy", "Close reason", "Close job", async (r) => ((await ppApi.jobAct(id, "close", r)), "Vacancy closed. Applicants are kept under the retention policy."), { danger: true, sub: "Applicants are kept (not deleted)." });
      if (a === "Mark filled") return confirm("Mark vacancy filled?", "It stops taking candidates.", "Mark filled", async () => ((await ppApi.jobAct(id, "fill")), "Vacancy filled."));
      if (a === "Duplicate") return run(async () => `Duplicated as ${(await ppApi.jobAct(id, "duplicate")).number ?? "a new draft"}.`);
    };

    const candModal = (d: { job?: string; data?: Record<string, string>; dup?: string } = {}) => {
      const p = d.data ?? {};
      const jobs = (opt?.jobs ?? []).filter((j) => ["Open", "Published"].includes(j.st));
      modal({
        title: "Add candidate",
        sub: "Stored as an employment candidate — never a CRM lead.",
        primaryT: d.dup ? "Add anyway" : "Add candidate",
        fields: [
          F("name", "Full name", "text", { req: true, af: true, value: p.name ?? "" }),
          F("email", "Email", "text", { req: true, value: p.email ?? "" }),
          F("phone", "Phone", "text", { value: p.phone ?? "" }),
          F("jobId", "Job", "select", { req: true, value: d.job ?? p.jobId ?? "", options: [{ v: "", t: jobs.length ? "Choose…" : "No open vacancies" }, ...jobs.map((j) => ({ v: j.v, t: j.t }))] }),
          F("source", "Source", "select", { value: p.source ?? "", options: O(opt?.lists.sources ?? []) }),
          F("referredBy", "Referred by", "text", { value: p.referredBy ?? "" }),
          F("availability", "Availability", "text", { value: p.availability ?? "", ph: "e.g. 2 weeks’ notice" }),
          ...(R?.comp ? [F("expectedComp", `Expected compensation (${opt?.currency}/month)`, "number", { value: p.expectedComp ?? "" })] : []),
          F("file", "Resume (filed in Contracts › Documents)", "file", { accept: ".pdf,.doc,.docx,.txt,.rtf,.odt" }),
          F("consent", "Privacy consent", "select", { req: true, value: p.consent ?? "", options: O([["", "Choose…"], ["Given", "Candidate consented to processing"], ["Pending", "Consent requested"]]) }),
        ],
        note: d.dup ? `⚠ ${d.dup}` : null,
        onSubmit: async (v) => {
          const data = { name: sv(v, "name"), email: sv(v, "email"), phone: sv(v, "phone"), jobId: sv(v, "jobId"), source: sv(v, "source"), referredBy: sv(v, "referredBy"), availability: sv(v, "availability"), expectedComp: sv(v, "expectedComp"), consent: sv(v, "consent"), force: !!d.dup };
          try {
            const r = await ppApi.createCand(data, v.file as File | null);
            await after(`${r.number} added.`);
          } catch (e) {
            const m = errText(e);
            if (/POSSIBLE_DUPLICATE/.test(m) && !d.dup) {
              candModal({ data: data as unknown as Record<string, string>, dup: m.replace(/^POSSIBLE_DUPLICATE — /, "Possible duplicate: ") });
              return "keep";
            }
            return m;
          }
        },
      });
    };

    const appAct = async (id: string, a: string) => {
      if (a === "Open") return open("cand", id);
      if (a.startsWith("Move to ")) {
        const to = a.slice(8);
        const c = await ref<{ version: number; name: string }>("cand", id);
        return run(async () => ((await ppApi.stage(id, to, "", c.version)), `${c.name} → ${to}.`));
      }
      if (a === "Schedule interview") return schedModal({ cand: id });
      if (a === "Create offer") return offerWizard(1, { candidateId: id });
      if (a === "Reject")
        return modal({
          title: "Reject candidate",
          primaryT: "Reject candidate",
          pBg: "#B42318",
          fields: [F("reason", "Reason (job-related)", "select", { options: O(REJ) }), F("note", "Detail", "text", { req: true, af: true }), F("msg", "Email the candidate a respectful update", "select", { options: O([["yes", "Yes"], ["no", "No"]]) })],
          note: "Reasons must be job-related. Data is retained per the candidate retention policy.",
          onSubmit: async (v) => {
            const r = await ppApi.reject(id, sv(v, "reason"), sv(v, "note"), sv(v, "msg") === "yes");
            await after(`Candidate rejected.${r.sent ? (r.sent.ok ? " Update emailed." : ` Email failed: ${r.sent.error}.`) : ""}`);
          },
        });
      if (a === "Mark withdrawn") return reason("Mark candidate withdrawn", "Reason", "Mark withdrawn", async (r) => ((await ppApi.stage(id, "Withdrawn", r)), "Candidate marked withdrawn."), { danger: true });
      if (a === "Send message" || a === "Request document")
        return modal({
          title: a,
          sub: "Sent by email from your configured email provider and logged on the candidate.",
          primaryT: "Send",
          fields: [F("text", a === "Send message" ? "Message" : "Which document do you need?", "area", { req: true, af: true, rows: 5 })],
          onSubmit: async (v) => void (await after(((await ppApi.message(id, a === "Send message" ? "message" : "document", sv(v, "text"))), "Email sent and logged."))),
        });
      if (a === "Hire / convert to Staff") return hireModal(id);
      if (a === "Download resume") return dl(() => ppApi.resumeLink(id), "Resume");
      if (a === "Upload resume")
        return modal({ title: "Upload resume", primaryT: "Upload", fields: [F("file", "Resume", "file", { req: true, accept: ".pdf,.doc,.docx,.txt,.rtf,.odt" })], onSubmit: async (v) => void (await after(`Resume filed as ${(await ppApi.resume(id, v.file as File)).number}.`)) });
    };

    const hireModal = async (id: string) => {
      const h = await ppApi.hireCheck(id);
      modal({
        title: `Hire ${h.name} · create or link Staff record`,
        primaryT: h.match ? "Continue" : "Create Staff record",
        fields: [
          F("pv", "Check", "read", { value: [`Accepted offer: ${h.offer ? `${h.offer.number} v${h.offer.version}` : "✕ none accepted"}`, `Start date: ${h.offer?.startDate ?? "—"}`, `Employment type: ${h.offer?.type ?? "—"} · ${h.offer?.frequency ?? ""}`, `Staff match check (email/phone): ${h.match ? `⚠ ${h.match.name} (${h.match.email ?? "no email"}) already has a Noxtill account${h.match.linked ? " in this business" : ""}` : "No existing account"}`].join("\n") }),
          ...(h.match ? [F("how", "Duplicate review", "select", { req: true, options: O([["", "Choose…"], ["link", `Same person — link to ${h.match.name}`], ["new", "Different person — create a new account"]]) })] : []),
        ],
        note: "Creates or links exactly one Staff identity (role: staff) and fills the payroll profile from the accepted offer. People & Payroll never keeps its own employee master.",
        onSubmit: async (v) => {
          if (!h.offer) return "APPROVAL_REQUIRED — no accepted offer. Hire only after the offer is signed.";
          const r = await ppApi.hire(id, sv(v, "how"));
          await after(r.tempPassword ? `Staff record created. Temporary password: ${r.tempPassword} — share it privately; they’ll change it on first login.` : "Linked to the existing Staff account. Onboarding updated.");
        },
      });
    };

    const schedModal = async (d: { id?: string; cand?: string; force?: boolean; prev?: Record<string, unknown> } = {}) => {
      const i = d.id ? await ref<Record<string, unknown>>("int", d.id) : null;
      const p = d.prev ?? {};
      const g = (k: string, def = "") => String(p[k] ?? i?.[k] ?? def);
      const ivs = ((p.interviewers ?? i?.interviewers ?? (opt?.me.inStaff ? [opt.me.uid] : [])) as string[]) ?? [];
      modal({
        title: i ? "Reschedule interview" : "Schedule interview",
        primaryT: d.force ? "Schedule anyway" : i ? "Reschedule" : "Schedule",
        fields: [
          ...(i ? [] : [F("candidateId", "Candidate", "select", { req: true, value: g("candidateId", d.cand ?? ""), options: [{ v: "", t: "Choose…" }, ...(opt?.cands ?? []).map((c) => ({ v: c.v, t: c.t }))] })]),
          F("round", "Round", "select", { value: g("round", opt?.lists.rounds[1] ?? ""), options: O(opt?.lists.rounds ?? []) }),
          F("date", "Date", "date", { req: true, value: g("date", plus(today, 1)) }),
          F("time", "Time", "time", { req: true, value: g("time", "11:00") }),
          F("timezone", "Timezone", "text", { value: g("timezone", opt?.tz ?? "") }),
          F("durationMin", "Duration (min)", "number", { value: g("durationMin", "45") }),
          F("interviewers", "Interviewers", "checks", { options: members().map((m) => ({ v: m.v, t: m.t, on: ivs.includes(m.v) })) }),
          F("location", "Location / video link", "text", { value: g("location") }),
          F("message", "Candidate message (emailed with the confirmation)", "area", { value: g("message") }),
        ],
        note: d.force ? "⚠ Conflict found — submitting again schedules anyway." : null,
        onSubmit: async (v) => {
          const b = { candidateId: sv(v, "candidateId") || undefined, round: sv(v, "round"), date: sv(v, "date"), time: sv(v, "time"), timezone: sv(v, "timezone"), durationMin: sv(v, "durationMin"), interviewers: arr(v, "interviewers"), location: sv(v, "location"), message: sv(v, "message"), force: !!d.force };
          try {
            const r = await ppApi.schedule(b, d.id);
            await after(`${r.number} ${d.id ? "rescheduled" : "scheduled"}. Interviewers notified in Noxtill. ${r.sent.ok ? "Candidate confirmation emailed." : `Candidate email failed: ${r.sent.error}.`}`);
          } catch (e) {
            const m = errText(e);
            if (/Submit again/.test(m) && !d.force) {
              void schedModal({ ...d, force: true, prev: b });
              setTimeout(() => st.getState().set({ modalErr: m }), 0);
              return "keep";
            }
            return m;
          }
        },
      });
    };

    const scoreModal = async (id: string, iv: string) => {
      const i = await ref<{ mine: { r: number[]; rec: string; note: string; ver: number } | null; competencies: string[] }>("int", id);
      const prev = iv === opt?.me.uid ? i.mine : null;
      modal({
        title: `${prev ? "Amend feedback" : "Scorecard"}`,
        sub: "Job-related criteria only. Submitted feedback is locked; an amendment needs a reason and creates a new version.",
        primaryT: prev ? "Submit amendment" : "Submit feedback (locks)",
        fields: [
          ...i.competencies.map((c, n) => F(`r${n}`, `${c} (1–5)`, "select", { req: true, value: prev ? String(prev.r[n] ?? "") : "", options: O([["", "Rate…"], "1", "2", "3", "4", "5"]) })),
          F("rec", "Recommendation", "select", { req: true, value: prev?.rec ?? "", options: O([["", "Choose…"], ...RECS.map((x) => [x, x] as [string, string])]) }),
          F("note", "Evidence / notes", "area", { req: true, value: prev?.note ?? "" }),
          ...(prev ? [F("why", "Reason for amendment", "text", { req: true })] : []),
        ],
        note: "Missing ratings are never filled in automatically.",
        onSubmit: async (v) => void (await after(`Feedback v${(await ppApi.score(id, { interviewer: iv, r: i.competencies.map((_, n) => sv(v, `r${n}`)), rec: sv(v, "rec"), note: sv(v, "note"), why: sv(v, "why") || undefined })).ver} submitted and locked.`)),
      });
    };

    const intAct = async (id: string, a: string) => {
      if (a === "Open" || a === "Open scorecard") return open("int", id);
      if (a === "Reschedule") return schedModal({ id });
      if (a === "Cancel") return reason("Cancel interview", "Reason", "Cancel interview", async (r) => ((await ppApi.intAct(id, "cancel", r)), "Interview cancelled."), { danger: true });
      if (a === "Send candidate confirmation") return run(async () => ((await ppApi.intAct(id, "confirm")), "Confirmation emailed to the candidate."));
      if (a === "Mark completed") return run(async () => ((await ppApi.intAct(id, "complete")), "Interview completed — interviewers asked for feedback within 24 h."));
      if (a === "Mark no-show") return run(async () => ((await ppApi.intAct(id, "noshow")), "Marked no-show."));
      if (a === "Submit feedback" || a === "Amend feedback") return scoreModal(id, opt?.me.uid ?? "");
    };

    const offerWizard = (step: number, d: Record<string, string>) => {
      const STEPS = ["Candidate / job", "Employment terms", "Compensation", "Benefits", "Conditions", "Approval", "Preview"];
      const cand = (opt?.cands ?? []).find((c) => c.v === d.candidateId);
      const fs: AField[][] = [
        [F("candidateId", "Candidate", "select", { req: true, value: d.candidateId ?? "", options: [{ v: "", t: "Choose…" }, ...(opt?.cands ?? []).filter((c) => ["Interview", "Final Interview", "Offer"].includes(c.stage)).map((c) => ({ v: c.v, t: c.t }))] })],
        [F("employmentType", "Employment type", "select", { value: d.employmentType ?? "Full-time", options: O(opt?.lists.empTypes ?? []) }), F("branchId", "Entity / branch", "select", { value: d.branchId ?? "", options: [{ v: "", t: "Vacancy’s branch" }, ...(opt?.branches ?? [])] }), F("startDate", "Start date", "date", { req: true, value: d.startDate ?? plus(today, 14) })],
        [F("comp", `Compensation (${opt?.currency})`, "number", { req: true, value: d.comp ?? "" }), F("frequency", "Pay frequency", "select", { value: d.frequency ?? "Monthly", options: O(["Monthly", "Hourly"]) })],
        [F("benefits", "Benefits summary", "text", { value: d.benefits ?? "" })],
        [F("probation", "Probation", "select", { value: d.probation ?? "None", options: O(["None", "3 months", "6 months"]) }), F("conditions", "Conditions", "text", { value: d.conditions ?? "" }), F("expiresInDays", "Offer expires in (days)", "number", { value: d.expiresInDays ?? "7" })],
        [F("apr", "Approval", "read", { value: "Every offer needs approval before it’s sent. It stays Draft until you submit it; the approver is set in Recruiting settings (default: Owner)." })],
        [F("pv", "Preview", "read", { value: [`Candidate: ${cand?.t ?? "—"}`, `Type: ${d.employmentType} · start ${d.startDate}`, `Compensation: ${R?.comp ? `${opt?.currency} ${d.comp} ${(d.frequency ?? "").toLowerCase()}` : "🔒"}`, `Benefits: ${d.benefits || "—"}`, `Probation: ${d.probation} · expires in ${d.expiresInDays} days`, "The letter is generated in Contracts after approval and signed with Noxtill eSign."].join("\n") })],
      ];
      modal({
        title: "Offer builder",
        sub: `${STEPS[step]} · step ${step + 1} of ${STEPS.length}`,
        primaryT: step === STEPS.length - 1 ? "Create draft offer" : "Next",
        back: step > 0 ? () => offerWizard(step - 1, d) : undefined,
        cancel: step > 0 ? "Back" : "Cancel",
        fields: fs[step],
        onSubmit: async (v) => {
          const n = { ...d };
          for (const f of fs[step]) if (f.type !== "read") n[f.name] = sv(v, f.name);
          if (step === 2 && !(Number(n.comp) > 0)) return "Enter compensation.";
          if (step < STEPS.length - 1) {
            offerWizard(step + 1, n);
            return "keep";
          }
          const r = await ppApi.createOffer({ ...n, branchId: n.branchId || null });
          await after(`${r.number} drafted${r.over ? " — above the vacancy’s range, flagged for the approver" : ""}. Submit it for approval.`);
        },
      });
    };

    const offAct = async (id: string, a: string) => {
      if (a === "Open") return open("offer", id);
      if (a === "Edit" || a === "Revise") {
        const o = await ref<{ version: number; comp: number | null; startDate: string; approvedComp: number | null }>("offer", id);
        return modal({
          title: "Edit / revise offer",
          primaryT: "Save new version",
          fields: [...(o.comp != null ? [F("comp", `Compensation (${opt?.currency})`, "number", { req: true, value: String(o.comp) })] : []), F("startDate", "Start date", "date", { value: o.startDate }), F("expiresInDays", "Expires in (days, from today)", "number", { value: "7" }), F("why", "Reason", "text", { req: true, af: true })],
          note: o.approvedComp != null ? `Changing compensation from the approved ${opt?.currency} ${o.approvedComp} sends it back to Approval Required.` : null,
          onSubmit: async (v) => {
            const r = await ppApi.reviseOffer(id, { comp: sv(v, "comp") || undefined, startDate: sv(v, "startDate"), expiresInDays: sv(v, "expiresInDays"), why: sv(v, "why"), expectedVersion: o.version });
            await after(r.reap ? "Compensation changed after approval — back to Approval Required." : `Saved as v${r.version} (${r.status}).`);
          },
        });
      }
      if (a === "Submit approval") return run(async () => ((await ppApi.offerAct(id, "submit")), "Sent for approval (approver notified in Noxtill)."));
      if (a === "Approve") return run(async () => ((await ppApi.offerAct(id, "approve")), "Offer approved. Next: generate the offer letter."));
      if (a === "Reject approval") return reason("Send offer back", "What needs to change?", "Send back", async (r) => ((await ppApi.offerAct(id, "rejectApproval", r)), "Sent back as Revised."), { danger: true });
      if (a === "Generate document") return run(async () => `Offer letter ${(await ppApi.offerAct(id, "generate")).doc ?? ""} generated in Contracts › Documents.`);
      if (a === "Send for signature") return run(async () => { const r = await ppApi.offerAct(id, "send"); return r.failed ? `Signature request ${r.request} prepared, but the email failed — check the email provider, then resend from Contracts › Signatures.` : `Sent with Noxtill eSign (${r.request}). Waiting for the candidate’s signature.`; });
      if (a === "Refresh eSign status") return run(async () => { const r = await ppApi.offerAct(id, "refresh"); return r.changed ? `eSign status → ${r.status}.${r.status === "Accepted" ? " Next: Hire / convert to Staff." : ""}` : `No change — still ${r.status}.`; });
      if (a === "Mark declined") return reason("Mark offer declined", "Decline reason", "Mark declined", async (r) => ((await ppApi.offerAct(id, "decline", r)), "Offer marked declined."), { danger: true });
      if (a === "Withdraw") return reason("Withdraw offer", "Reason", "Withdraw", async (r) => ((await ppApi.offerAct(id, "withdraw", r)), "Offer withdrawn (any open signature request voided)."), { danger: true });
      if (a === "Open signed document") return dl(() => ppApi.offerDoc(id), "Offer document");
      if (a === "Start onboarding") {
        const o = await ref<{ candidateId: string }>("offer", id);
        return go("onboarding", undefined, undefined), flash(`Onboarding opened when the offer was accepted — candidate ${(opt?.cands ?? []).find((c) => c.v === o.candidateId)?.t ?? ""}. Hire / convert them from Applicants to link the Staff record.`);
      }
    };

    // ── onboarding ────────────────────────────────────────────────────────
    const onbAct = async (id: string, a: string) => {
      if (a === "Open") return open("onb", id);
      if (a === "Start onboarding") return run(async () => { const r = await ppApi.onbStart(id); return `Onboarding started.${r.note ? ` ${r.note}` : ` ${r.tasks} task(s) created in Projects & Tasks.`}`; });
      if (a === "Create linked tasks") return run(async () => `${(await ppApi.onbTasks(id)).created} task(s) created in Projects & Tasks and linked.`);
      if (a === "Request documents")
        return modal({ title: "Request documents", sub: "Emailed to the new starter.", primaryT: "Send", fields: [F("text", "What do you need?", "area", { req: true, af: true, rows: 4, value: "Please send a copy of your ID, bank details and any certificates before your start date." })], onSubmit: async (v) => void (await after(((await ppApi.onbDocs(id, sv(v, "text"))), "Document request emailed."))) });
      if (a === "Assign training") {
        const o = await ref<{ userId: string | null }>("onb", id);
        if (!o.userId) return flash("Hire / convert the candidate to Staff first — training is assigned to the Staff record.");
        return assignTrModal({ ids: [o.userId] });
      }
      if (a === "item") {
        const o = await ref<{ open: { n: number; t: string }[] }>("onb", id);
        return modal({
          title: "Mark item complete",
          primaryT: "Mark complete",
          fields: [F("n", "Item", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...o.open.map((x) => ({ v: String(x.n), t: x.t }))] }), F("override", "Override reason (only for mandatory access/payroll items)", "text")],
          note: "Access and payroll items complete on their own when the Staff login is active and the payroll profile is complete. Overriding a mandatory item needs a reason.",
          onSubmit: async (v) => void (await after(`Item done · case ${(await ppApi.onbItem(id, Number(sv(v, "n")), sv(v, "override"))).status}.`)),
        });
      }
      if (a === "edit") {
        const o = await ref<{ managerUserId: string; buddyUserId: string; startDate: string }>("onb", id);
        return modal({ title: "Edit onboarding", primaryT: "Save", fields: [F("managerUserId", "Manager", "select", { value: o.managerUserId, options: memberOpts("None") }), F("buddyUserId", "Buddy", "select", { value: o.buddyUserId, options: memberOpts("None") }), F("startDate", "Start date", "date", { value: o.startDate })], onSubmit: async (v) => void (await after(((await ppApi.onbEdit(id, { managerUserId: sv(v, "managerUserId") || null, buddyUserId: sv(v, "buddyUserId") || null, startDate: sv(v, "startDate") })), "Onboarding updated."))) });
      }
    };

    // ── leave ─────────────────────────────────────────────────────────────
    const leaveModal = (emerg = false) => {
      const types = opt?.leaveTypes ?? [];
      if (!types.length) return flash("NOT_CONFIGURED — no leave types yet. An Owner sets them in More… › Settings · Leave types.");
      const who = R?.leaveApprove ? (opt?.team ?? []) : (opt?.members ?? []).filter((m) => m.v === opt?.me.uid);
      modal({
        title: emerg ? "Record emergency absence" : "Request leave",
        primaryT: emerg ? "Record absence" : "Submit request",
        fields: [
          F("userId", "Employee", "select", { value: opt?.me.inStaff ? opt.me.uid : (who[0]?.v ?? ""), options: who.map((m) => ({ v: m.v, t: m.t })) }),
          F("type", "Leave type", "select", { req: true, options: types.map((t) => ({ v: t.v, t: `${t.t}${t.bal != null ? ` · my balance ${t.bal} d` : ""}` })) }),
          F("from", "From", "date", { req: true, value: emerg ? today : plus(today, 3) }),
          F("to", "To", "date", { req: true, value: emerg ? today : plus(today, 3) }),
          F("partial", "Partial day", "select", { options: O([["", "Full day(s)"], ["1", "Half day"]]) }),
          F("reason", "Reason (sensitive reasons are visible to HR only)", "text", { req: true, af: true }),
          F("file", "Attachment (e.g. certificate)", "file"),
        ],
        note: "Balance and overlaps are checked on submit. Negative balances are blocked unless the leave type allows them.",
        onSubmit: async (v) => {
          const r = await ppApi.leave({ userId: sv(v, "userId"), type: sv(v, "type"), from: sv(v, "from"), to: sv(v, "to"), partial: sv(v, "partial") === "1", reason: sv(v, "reason"), emergency: emerg }, v.file as File | null);
          await after(emerg ? `${r.number} recorded as approved — Staff schedules and Bookings now see the absence.` : `${r.number} submitted — the approver was notified in Noxtill.`);
        },
      });
    };
    const lvAct = async (id: string, a: string) => {
      if (a === "Open" || a === "Open schedule impact") return open("leave", id);
      const l = await ref<{ status: string; number: string }>("leave", id);
      if (a === "Approve") return run(async () => ((await ppApi.leaveAct(id, "approve", "", l.status)), `${l.number} approved — Staff schedules and Bookings see it now.`));
      if (a === "Reject") return reason(`Reject ${l.number}`, "Reason", "Reject", async (r) => ((await ppApi.leaveAct(id, "reject", r, l.status)), `${l.number} rejected.`), { danger: true });
      if (a === "Cancel request") return confirm(`Cancel ${l.number}?`, l.status === "Approved" ? "The balance is restored and availability reopens." : "", "Cancel request", async () => ((await ppApi.leaveAct(id, "cancel", "", l.status)), `${l.number} cancelled.`), true);
      if (a === "Download attachment") return dl(() => ppApi.leaveAtt(id), "Attachment");
    };

    // ── payroll ───────────────────────────────────────────────────────────
    const resolveModal = (rowId: string) => {
      const [t, ws] = rowId.split("|");
      const who = (ws ?? "").split(",").filter((x) => x && x !== "—");
      const names = who.map((u) => members().find((m) => m.v === u)?.t ?? u).join(", ");
      if (/Leave/.test(t)) return go("leave", { st: "Submitted" }, { lvView: "req" });
      if (/Overtime|Advances|Deductions|Commission/.test(t)) return router.push(/Advances/.test(t) ? "/staff/advances" : /Commission/.test(t) ? "/staff/commissions" : /Overtime/.test(t) ? "/staff/timesheets" : "/staff/payroll");
      if (/Tax profiles/.test(t) && !opt?.taxTable) return settingsModal("tax");
      const fixKind = /Timesheet/.test(t) ? "ts" : /Tax/.test(t) ? "tax" : /bank/.test(t) ? "bank" : null;
      modal({
        title: `Resolve input · ${t}`,
        sub: "Fixes are made at the source; payroll re-reads them. Locked snapshots don’t change until you recalculate.",
        primaryT: "Continue",
        fields: [
          F("who", "Employees", "read", { value: names || "—" }),
          F("how", "Action", "select", {
            req: true,
            options: [
              ...(fixKind === "ts" ? [{ v: "ts", t: "Ask their manager to approve the timesheet in Staff" }, { v: "staff", t: "Open Staff › Timesheets" }] : []),
              ...(fixKind === "tax" || fixKind === "bank" ? [{ v: fixKind, t: `Ask the employee(s) to complete their ${fixKind === "tax" ? "tax status" : "bank details"} (in-app)` }] : []),
              ...who.map((u) => ({ v: `edit:${u}`, t: `Edit ${members().find((m) => m.v === u)?.t ?? "profile"} now` })),
            ],
          }),
        ],
        onSubmit: async (v) => {
          const h = sv(v, "how");
          if (h.startsWith("edit:")) {
            void profileModal(h.slice(5));
            return "keep";
          }
          if (h === "staff") return void router.push("/staff/timesheets");
          await after(`${(await ppApi.fix(h, who)).notified} person(s) notified in Noxtill.`);
        },
      });
    };

    const runAct = async (a: string, id: string) => {
      const r = (opt?.runs ?? []).find((x) => x.v === id) ?? null;
      if (!id) return flash("Open a run first.");
      const doIt = async (b: Record<string, unknown> = {}) => {
        const res = await ppApi.runAct(id, a, b);
        const msg: Record<string, string> = {
          lock: "Inputs locked into a hashed snapshot. Next: calculate.",
          calc: res.status === "Exceptions" ? "Calculated with blocking exceptions — resolve or exclude before approval." : "Calculated. Review, then submit for approval.",
          recalc: "Recalculated from fresh inputs (controlled).",
          submit: "Submitted for approval — approvers notified.",
          approve: "Approved. Approved ≠ paid — next: finalize.",
          reject: "Sent back to Calculated.",
          post: res.status === "Finance Posted" ? `Finance posted journal ${res.journal}. Employees are not paid yet.` : `Posting requested — still pending: ${res.why ?? "waiting for the ledger"}.`,
          postcheck: res.status === "Finance Posted" ? `Finance posted journal ${res.journal}.` : `Still pending: ${res.why ?? "waiting for the ledger"}.`,
          rollback: "Rolled back to Draft.",
          cancel: "Run cancelled.",
        };
        if ((a === "payout" || a === "retry") && res.url) {
          openUrl(res.url);
          return `Bank file ${res.batch} created and opened. Upload it to your bank, then record the bank’s confirmation here.`;
        }
        return msg[a] ?? `Status: ${res.status ?? "updated"}.`;
      };
      if (a === "lock") {
        if (R?.owner) {
          try {
            return await after(await doIt());
          } catch (e) {
            const m = errText(e);
            if (/override reason/.test(m)) return reason("Lock with blocking exceptions?", "Owner override reason (audited)", "Lock inputs", async (why) => doIt({ override: why }), { dark: true, sub: m });
            return flash(m);
          }
        }
        return run(() => doIt());
      }
      if (a === "approve") {
        try {
          return await after(await doIt());
        } catch (e) {
          const m = errText(e);
          if (/Owner override reason/.test(m)) return reason("Approve your own run?", "Override reason (audited)", "Approve", async (why) => doIt({ override: why }), { dark: true, sub: m });
          return flash(m);
        }
      }
      if (a === "reject") return reason("Reject run", "What needs to change?", "Reject", async (why) => doIt({ reason: why }), { danger: true });
      if (a === "cancel") return reason("Cancel run", "Reason", "Cancel run", async (why) => doIt({ reason: why }), { danger: true });
      if (a === "rollback") return confirm("Rollback to Draft?", "Draft only — clears calculations; nothing finalized is touched.", "Rollback", () => doIt(), true);
      if (a === "finalize") {
        const want = `FINALIZE ${label(r?.period ?? opt?.period ?? "").toUpperCase()}`;
        return modal({ title: `Finalize ${r?.t.split(" · ")[0] ?? ""}`, sub: "Finalized payroll can’t be edited — corrections need a correction run. Payslips are generated, Staff advances recovered and commissions marked settled.", primaryT: "Finalize payroll", pBg: "#0A1B2A", fields: [F("typed", `Type ${want} to confirm`, "text", { req: true, af: true })], onSubmit: async (v) => void (await after(((await ppApi.runAct(id, "finalize", { typed: sv(v, "typed") })), "Finalized. Not paid yet — next: finance posting, then payout."))) });
      }
      if (a === "paycheck") {
        const lines = (r?.lines ?? []).filter((l) => l.payout === "Processing");
        if (!lines.length) return flash("Nothing is waiting for a bank confirmation.");
        return modal({
          title: "Record bank confirmation",
          sub: "Mark each transfer from your bank statement. Paid needs the bank’s reference.",
          primaryT: "Record",
          wide: true,
          fields: lines.flatMap((l) => [F(`s_${l.v}`, `${l.t}${l.net != null ? ` · ${opt?.currency} ${l.net}` : ""}`, "select", { options: O([["", "Still processing"], ["Paid", "Paid"], ["Failed", "Failed"]]) }), F(`r_${l.v}`, "Bank reference", "text")]),
          onSubmit: async (v) => {
            const results = lines.map((l) => ({ uid: l.v, status: sv(v, `s_${l.v}`), ref: sv(v, `r_${l.v}`) })).filter((x) => x.status);
            if (!results.length) return "Mark at least one transfer.";
            await after(`Recorded — run is now ${(await ppApi.runAct(id, "paycheck", { results })).status}.`);
          },
        });
      }
      if (a === "file") return dl(() => ppApi.bankFile(id), "Bank file");
      return run(() => doIt());
    };

    const correctionModal = () => {
      const src = [...(opt?.runs ?? [])].reverse().find((r) => r.final);
      if (!src) return flash("No finalized run to correct.");
      modal({
        title: `Correction run for ${src.t.split(" · ")[0]}`,
        sub: "The original stays immutable. The correction pays only the difference against what was already finalized for the period.",
        primaryT: "Create correction run",
        fields: [F("ids", "Employees to correct", "checks", { options: members().map((m) => ({ v: m.v, t: m.t })) })],
        onSubmit: async (v) => {
          const r = await ppApi.correction(src.v, arr(v, "ids"));
          st.getState().set({ run: r.id, view: { ...st.getState().view, runTab: "sum" } });
          await after(`${r.number} created as a draft.`);
        },
      });
    };

    const startPay = async () => {
      if (!need(R?.payroll, "Starting payroll")) return;
      try {
        const r = await ppApi.startRun();
        st.getState().set({ run: r.id, view: { ...st.getState().view, runTab: "sum" } });
        go("runs");
        await after(r.existing ? `${r.number} is already open.` : `${r.number} created. Next: lock inputs.`);
      } catch (e) {
        flash(errText(e));
      }
    };

    const psAct = async (id: string, a: string) => {
      const [runId, uid] = id.split("|");
      if (a === "Preview") return open("slip", id);
      if (a === "Download") return dl(() => ppApi.slipPdf(runId, uid), "Payslip PDF");
      return run(async () => `Payslip ${(await ppApi.deliver(runId, uid)).status === "Delivered" ? "delivered to the employee in Noxtill" : "delivery failed — they have no active Staff login"}.`);
    };

    // ── benefits ──────────────────────────────────────────────────────────
    const ruleModal = () =>
      modal({
        title: "Create rule",
        sub: "Nothing statutory is built in — enter the contributions, benefits and deductions your business actually runs.",
        primaryT: "Create rule",
        wide: true,
        fields: [
          F("name", "Rule name", "text", { req: true, af: true }),
          F("type", "Type", "select", { options: O(opt?.lists.ruleTypes ?? []) }),
          F("method", "Method", "select", { options: O(["Fixed", "Percentage of base"]) }),
          F("pp", "Tax treatment", "select", { options: O(opt?.lists.taxTreatments ?? []) }),
          F("cls", "Classification", "text", { ph: "e.g. Statutory · Pension fund · Internal" }),
          F("ee", "Employee share (amount or %)", "number", { value: "0" }),
          F("er", "Employer share (amount or %)", "number", { value: "0" }),
          F("from", "Effective from", "date", { req: true, value: plus(today, 1) }),
          F("fin", "Finance account reference", "text", { ph: "e.g. 2400 Payroll Liabilities" }),
          F("prov", "Provider", "text"),
          F("elig", "Eligibility", "text", { value: "Assigned employees" }),
          F("why", "Reason", "text", { req: true }),
        ],
        onSubmit: async (v) => void (await after(`${(await ppApi.createRule({ name: sv(v, "name"), type: sv(v, "type"), method: sv(v, "method"), pp: sv(v, "pp"), cls: sv(v, "cls"), ee: sv(v, "ee"), er: sv(v, "er"), from: sv(v, "from"), fin: sv(v, "fin"), prov: sv(v, "prov"), elig: sv(v, "elig"), why: sv(v, "why") })).number} created. Assign it to employees from Assignments.`)),
      });
    const benAct = async (id: string, a: string) => {
      if (a === "Open") return open("rule", id);
      const r = await ref<{ method: string; ee: number | null; er: number | null; name: string }>("rule", id);
      const pct = r.method.startsWith("Percentage");
      if (a === "Schedule change")
        return modal({
          title: `Schedule change · ${r.name}`,
          primaryT: "Preview impact",
          fields: [F("ee", `Employee share${pct ? " (%)" : ` (${opt?.currency})`}`, "number", { value: String(r.ee ?? 0) }), F("er", `Employer share${pct ? " (%)" : ` (${opt?.currency})`}`, "number", { value: String(r.er ?? 0) }), F("from", "Effective from", "date", { req: true, value: plus(today, 1) }), F("why", "Reason", "text", { req: true })],
          note: "Effective-dated: the current version keeps applying until the new date. Finalized runs keep their version.",
          onSubmit: async (v) => {
            const b = { ee: sv(v, "ee"), er: sv(v, "er"), from: sv(v, "from"), why: sv(v, "why") };
            const imp = await ppApi.ruleImpact(id, b);
            modal({ title: "Impact preview", sub: r.name, primaryT: "Schedule change", fields: [F("imp", "Impact", "read", { value: imp.lines.join("\n") })], onSubmit: async () => void (await after(`Scheduled as v${(await ppApi.ruleChange(id, b)).ver} from ${b.from}. Earlier runs keep their version.`)) });
            return "keep";
          },
        });
      if (a === "Bulk assign") return pick(`Bulk assign ${r.name}`, "Department", (opt?.depts ?? []).map((x) => ({ v: x, t: x })), async (dep) => `Assigned to ${(await ppApi.ruleDept(id, dep)).assigned} employee(s) in total.`);
      if (a === "Deactivate future") return modal({ title: `End ${r.name}`, primaryT: "End rule", pBg: "#B42318", fields: [F("to", "Last effective date", "date", { req: true, value: plus(today, 30) })], onSubmit: async (v) => void (await after(((await ppApi.ruleEnd(id, sv(v, "to"))), "Rule end-dated."))) });
    };

    // ── performance ───────────────────────────────────────────────────────
    const reviewModal = (id: string, mode: "self" | "mgr") =>
      modal({
        title: mode === "self" ? "Self review" : "Manager review",
        primaryT: "Submit",
        fields: [F("txt", mode === "self" ? "Your reflection on your goals" : "Manager comments (visible to HR, you and the employee)", "area", { req: true, af: true, rows: 6 }), ...(mode === "mgr" ? [F("rating", "Rating (human judgement)", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...O(opt?.ratings ?? [])] }), F("dev", "Development plan", "text")] : [])],
        note: "Nothing is auto-scored or suggested — the rating is yours.",
        onSubmit: async (v) => void (await after(((await ppApi.reviewAct(id, mode, { txt: sv(v, "txt"), rating: sv(v, "rating") || undefined, dev: sv(v, "dev") || undefined })), "Review submitted."))),
      });
    const perfAct = async (id: string, a: string) => {
      if (a === "Open") return open("review", id);
      if (a === "Submit self review") return reviewModal(id, "self");
      if (a === "Submit manager review") return reviewModal(id, "mgr");
      if (a === "Request self review") return run(async () => ((await ppApi.reviewAct(id, "requestSelf")), "Self-review requested — they were notified in Noxtill."));
      if (a === "Acknowledge") return run(async () => ((await ppApi.reviewAct(id, "ack")), "Review acknowledged."));
      if (a === "Create development task")
        return modal({ title: "Create development task", sub: "Created in Projects & Tasks and assigned to the employee.", primaryT: "Create task", fields: [F("txt", "Development action", "text", { req: true, af: true })], onSubmit: async (v) => void (await after(`Task ${(await ppApi.reviewAct(id, "devtask", { txt: sv(v, "txt") })).task} created and linked.`)) });
      if (a === "Add goal") return modal({ title: "Add goal", primaryT: "Add", fields: [F("goal", "Goal", "text", { req: true, af: true }), F("weight", "Weight (%)", "number", { req: true, value: "25" })], onSubmit: async (v) => void (await after(((await ppApi.reviewAct(id, "goal", { goal: sv(v, "goal"), weight: sv(v, "weight") })), "Goal added."))) });
    };
    const cycleModal = () =>
      modal({
        title: "Create review cycle",
        primaryT: "Create",
        fields: [F("name", "Cycle name", "text", { req: true, af: true, ph: "e.g. H2 2026" }), F("start", "Start", "date", { req: true, value: today }), F("end", "End", "date", { req: true, value: plus(today, 45) }), F("scale", "Rating scale (points)", "number", { value: String(opt?.ratings.length ?? 4) })],
        onSubmit: async (v) => void (await after(`${(await ppApi.cycle({ name: sv(v, "name"), start: sv(v, "start"), end: sv(v, "end"), scale: sv(v, "scale") })).number} created. Add reviews from the Cycles view.`)),
      });

    // ── training ──────────────────────────────────────────────────────────
    const courseModal = () =>
      modal({
        title: "Create training item",
        primaryT: "Create",
        wide: true,
        fields: [
          F("name", "Course name", "text", { req: true, af: true }),
          F("provider", "Provider", "text", { value: "Internal" }),
          F("type", "Type", "select", { options: O(opt?.lists.courseTypes ?? []) }),
          F("roles", "Required for departments", "checks", { options: (opt?.depts ?? []).map((x) => ({ v: x, t: x })) }),
          F("hours", "Duration (hours)", "number", { req: true, value: "1" }),
          F("mode", "Mode", "select", { options: O(["In person", "Online", "On the job"]) }),
          F("assessment", "Assessment", "select", { options: O([["", "No"], ["1", "Yes — score required"]]) }),
          F("skill", "Skill it proves", "text"),
          F("validDays", "Certificate validity (days, blank = no expiry)", "number"),
        ],
        onSubmit: async (v) => void (await after(`${(await ppApi.course({ name: sv(v, "name"), provider: sv(v, "provider"), type: sv(v, "type"), roles: arr(v, "roles"), hours: sv(v, "hours"), mode: sv(v, "mode"), assessment: sv(v, "assessment") === "1", skill: sv(v, "skill"), validDays: sv(v, "validDays") || null })).number} created.`)),
      });
    const assignTrModal = (d: { course?: string; ids?: string[] } = {}) => {
      if (!(opt?.courses ?? []).length) return flash("Create a training item in the Catalog first.");
      modal({
        title: "Assign training",
        primaryT: "Assign",
        fields: [F("courseId", "Course", "select", { req: true, value: d.course ?? "", options: [{ v: "", t: "Choose…" }, ...(opt?.courses ?? []).map((c) => ({ v: c.v, t: c.t }))] }), F("ids", "Employees", "checks", { options: (opt?.team ?? []).map((m) => ({ v: m.v, t: m.t, on: (d.ids ?? []).includes(m.v) })) }), F("dueDays", "Due in (days)", "number", { value: "14" })],
        onSubmit: async (v) => {
          if (!arr(v, "ids").length) return "Pick employees.";
          const r = await ppApi.assignTr({ courseId: sv(v, "courseId"), ids: arr(v, "ids"), dueDays: Number(sv(v, "dueDays")) || 14 });
          await after(`Assigned to ${r.assigned}${r.skipped ? ` · skipped ${r.skipped} who already have it open` : ""}.`);
        },
      });
    };
    const trAct = async (id: string, a: string) => {
      if (a === "Mark completion")
        return modal({ title: "Mark completion", primaryT: "Mark completed", fields: [F("score", "Assessment score (%) — if the course has one", "number"), F("file", "Certificate (filed in Contracts › Documents)", "file"), F("note", "Notes", "text")], note: "HR verifies completion before it counts toward skills.", onSubmit: async (v) => void (await after(((await ppApi.trAct(id, { act: "complete", score: sv(v, "score"), note: sv(v, "note") }, v.file as File | null)), "Marked completed — awaiting verification."))) });
      if (a === "Start") return run(async () => ((await ppApi.trAct(id, { act: "start" })), "Started."));
      if (a === "Verify completion") return run(async () => ((await ppApi.trAct(id, { act: "verify" })), "Verified — it now counts toward skills."));
      if (a === "Upload / link certificate") return modal({ title: "Upload certificate", primaryT: "Upload", fields: [F("file", "Certificate", "file", { req: true })], onSubmit: async (v) => void (await after(((await ppApi.trAct(id, { act: "cert" }, v.file as File)), "Certificate filed in Contracts › Documents."))) });
      if (a === "Renew") return run(async () => ((await ppApi.trAct(id, { act: "renew" })), "Renewal assigned."));
      if (a === "Send reminder") return run(async () => ((await ppApi.trAct(id, { act: "remind" })), "Reminder sent in Noxtill."));
    };

    // ── offboarding ───────────────────────────────────────────────────────
    const ofbModal = () =>
      modal({
        title: "Start offboarding",
        primaryT: "Start",
        fields: [
          F("userId", "Employee", "select", { req: true, options: [{ v: "", t: "Choose…" }, ...members().filter((m) => m.v !== opt?.me.uid).map((m) => ({ v: m.v, t: m.t }))] }),
          F("exitType", "Exit type", "select", { options: O(opt?.lists.exitTypes ?? []) }),
          F("reason", "Exit reason (restricted)", "text", { req: true }),
          F("noticeDate", "Notice date", "date", { value: today }),
          F("lastDay", "Last working day", "date", { req: true, value: plus(today, 30) }),
          F("handoverUserId", "Handover owner", "select", { options: memberOpts("None") }),
        ],
        note: "Exit decisions are made by people. Completing the case deactivates the Staff login and keeps all history.",
        onSubmit: async (v) => void (await after(`${(await ppApi.ofbStart({ userId: sv(v, "userId"), exitType: sv(v, "exitType"), reason: sv(v, "reason"), noticeDate: sv(v, "noticeDate"), lastDay: sv(v, "lastDay"), handoverUserId: sv(v, "handoverUserId") || undefined })).number} started — status Notice.`)),
      });
    const ofbAct = async (id: string, a: string) => {
      if (a === "Open") return open("ofb", id);
      const k = ({ "Create linked tasks": "tasks", "Revoke access": "access", "Confirm asset return": "asset", "Link final payroll": "final", "Generate documents": "docs", Complete: "complete", "Mark item done": "item" } as Record<string, string>)[a] ?? a;
      if (k === "tasks") return run(async () => `${String((await ppApi.ofbAct(id, "tasks")).created)} task(s) created in Projects & Tasks.`);
      if (k === "access") return confirm("Revoke access?", "If the last working day has passed the Staff login is deactivated now on every branch; otherwise it’s scheduled and happens automatically after that day.", "Revoke access", async () => ((await ppApi.ofbAct(id, "access")).verified ? "Staff login deactivated — history kept." : "Revocation scheduled for the last working day."), true);
      if (k === "asset") return modal({ title: "Confirm asset return", sub: "Assets & Maintenance doesn’t record who holds an asset, so this is a manual confirmation.", primaryT: "Confirm", fields: [F("note", "What was returned", "text", { req: true, af: true })], onSubmit: async (v) => void (await after(((await ppApi.ofbAct(id, "asset", { note: sv(v, "note") })), "Asset return confirmed."))) });
      if (k === "final") {
        const o = await ref<{ period: string }>("ofb", id);
        const runs = (opt?.runs ?? []).filter((r) => r.period >= o.period.slice(0, 7) || r.period === o.period);
        if (!runs.length) return flash(`No payroll run for ${label(o.period)} yet — start one in Payroll.`);
        return pick("Link final payroll", "Run", runs.map((r) => ({ v: r.v, t: r.t })), async (runId) => `Final pay linked to ${String((await ppApi.ofbAct(id, "final", { runId })).run)}.`, { note: "Final pay is calculated in the payroll run — never recalculated in Offboarding. Leave payout, if any, goes in as a Staff payroll line item." });
      }
      if (k === "docs") return run(async () => `Experience letter ${String((await ppApi.ofbAct(id, "docs")).doc)} generated in Contracts › Documents.`);
      if (k === "item") {
        const o = await ref<{ open: { n: number; t: string }[] }>("ofb", id);
        if (!o.open.length) return flash("No other open items.");
        return pick("Mark item done", "Item", o.open.map((x) => ({ v: String(x.n), t: x.t })), async (n) => ((await ppApi.ofbAct(id, "item", { note: n })), "Item done."));
      }
      if (k === "complete")
        return modal({
          title: "Complete offboarding",
          sub: "Deactivates the Staff login on every branch and sets the profile to Exited. History is preserved.",
          primaryT: "Complete",
          pBg: "#B42318",
          fields: [F("reason", "Override reason (only if mandatory items are still open)", "text")],
          onSubmit: async (v) => void (await after(((await ppApi.ofbAct(id, "complete", { reason: sv(v, "reason") || undefined })), "Offboarding completed — Staff login deactivated."))),
        });
    };

    // ── settings (More… menu) ─────────────────────────────────────────────
    const settingsModal = async (sec: string) => {
      const s = await ppApi.settings();
      const c = s.config;
      const yes = (b: boolean) => (b ? "1" : "");
      const tf = () => O([["1", "On"], ["", "Off"]]);
      const map: Record<string, { title: string; sub: string; fields: AField[] }> = {
        payroll: {
          title: "Payroll settings",
          sub: "How pay is calculated. Overtime multiplier and break rules come from Staff › Settings.",
          fields: [
            F("payGroup", "Pay group name", "text", { value: c.payroll.payGroup }),
            F("payDay", "Pay day of month (0 = last day)", "number", { value: String(c.payroll.payDay) }),
            F("workingDays", "Working days per month (unpaid-leave deduction)", "number", { value: String(c.payroll.workingDays) }),
            F("standardHours", "Standard hours per month (salaried hourly rate)", "number", { value: String(c.payroll.standardHours) }),
            F("overtimeWarnHours", "Overtime warning above (hours)", "number", { value: String(c.payroll.overtimeWarnHours) }),
            F("advanceWarnAmount", `Advance recovery warning above (${opt?.currency}, blank = off)`, "number", { value: c.payroll.advanceWarnAmount == null ? "" : String(c.payroll.advanceWarnAmount) }),
            F("separationOfDuties", "Separation of duties (preparer can’t approve)", "select", { value: yes(c.payroll.separationOfDuties), options: tf() }),
            F("paidFromCode", "Net pay paid from (Finance account)", "select", { value: c.payroll.paidFromCode ?? "", options: [{ v: "", t: "Finance’s default expense account" }, ...s.accounts] }),
            F("departments", "Departments (comma separated)", "text", { value: c.payroll.departments.join(", ") }),
          ],
        },
        tax: {
          title: "Income tax table",
          sub: "Enter your jurisdiction’s withholding table. Nothing is built in — tax can’t be calculated until a table exists.",
          fields: [
            F("key", "Table name", "text", { value: c.tax.activeKey ?? "", ph: "e.g. Income tax FY 2026-27" }),
            F("effectiveFrom", "Effective from", "date", { value: c.tax.tables.find((t) => t.key === c.tax.activeKey)?.effectiveFrom ?? today }),
            F("slabs", "Slabs — one per line: annual upper limit | rate % | fixed tax below this slab (use - for no upper limit)", "area", { rows: 7, value: s.text.slabs, ph: "600000 | 0 | 0\n1200000 | 5 | 0\n- | 15 | 30000" }),
            F("nonFilerMultiplier", "Multiplier for Non-filer tax status (1 = none)", "number", { value: String(c.tax.tables.find((t) => t.key === c.tax.activeKey)?.nonFilerMultiplier ?? 1) }),
            F("source", "Source / notice reference", "text", { value: c.tax.tables.find((t) => t.key === c.tax.activeKey)?.source ?? "" }),
          ],
        },
        leave: {
          title: "Leave types",
          sub: "Entitlements and paid/unpaid rules are your policy — nothing is assumed.",
          fields: [
            F("types", "One per line: key | name | days per year (- = no balance) | paid yes/no | sensitive yes/no | negative allowed yes/no", "area", { rows: 7, value: s.text.leave, ph: "annual | Annual leave | 14 | yes | no | no\nsick | Sick leave | 8 | yes | yes | no\nunpaid | Unpaid leave | - | no | no | yes" }),
            F("yearStartMonth", "Leave year starts in month (1–12)", "number", { value: String(c.leave.yearStartMonth) }),
          ],
        },
        recruit: {
          title: "Recruiting & careers",
          sub: "Approvals, scorecards and the public careers page.",
          fields: [
            F("offerApproverUserId", "Offer approver", "select", { value: c.recruiting.offerApproverUserId ?? "", options: memberOpts("Owner(s)") }),
            F("jobApprovalRequired", "Vacancies need approval", "select", { value: yes(c.recruiting.jobApprovalRequired), options: tf() }),
            F("competencies", "Scorecard competencies (comma separated, job-related)", "text", { value: c.recruiting.competencies.join(", ") }),
            F("hideFeedbackUntilSubmitted", "Hide others’ feedback until you submit yours", "select", { value: yes(c.recruiting.hideFeedbackUntilSubmitted), options: tf() }),
            F("careersEnabled", "Public careers page", "select", { value: yes(c.recruiting.careersEnabled), options: tf(), help: opt?.careers ? `Live at /careers/${opt.careers.slug}` : "Turning it on publishes nothing by itself — publish each vacancy." }),
            F("careersIntro", "Careers page introduction", "area", { value: c.recruiting.careersIntro }),
            F("retentionMonths", "Keep rejected candidates for (months)", "number", { value: String(c.recruiting.retentionMonths) }),
          ],
        },
        onb: {
          title: "Checklists & tasks",
          sub: "Templates for new cases (existing cases keep their items) and where HR tasks are created.",
          fields: [
            F("projectId", "Projects & Tasks project for HR tasks (this branch)", "select", { value: c.tasks.projectId ?? "", options: [{ v: "", t: s.projects.length ? "Not set" : "No projects in this branch" }, ...s.projects] }),
            F("onb", "Onboarding — one per line: milestone | task | owner | days from start | mandatory yes/no | kind (doc/staff/access/payroll/task/training)", "area", { rows: 6, value: s.text.onb }),
            F("ofb", "Offboarding — one per line: task | kind (task/access/asset/payroll/doc) | mandatory yes/no | owner", "area", { rows: 5, value: s.text.ofb }),
            F("ratings", "Performance rating labels (comma separated)", "text", { value: c.performance.ratings.join(", ") }),
          ],
        },
      };
      const m = map[sec];
      if (!m) return;
      modal({
        title: m.title,
        sub: `${m.sub} · Settings v${s.version}${s.canEdit ? "" : " · read only for your role"}`,
        primaryT: s.canEdit ? "Save settings" : "Close",
        wide: true,
        fields: m.fields,
        onSubmit: async (v) => {
          if (!s.canEdit) return;
          const values: Record<string, unknown> = {};
          for (const f of m.fields) values[f.name] = sv(v, f.name);
          const r = await ppApi.saveSettings(sec, values, s.version);
          await qc.invalidateQueries({ queryKey: ["pp"] });
          flash(r.changed.length ? `Settings v${r.version} saved · ${r.changed.join(", ")} · audited.` : "No changes to save.");
        },
      });
    };

    const exportModal = () => {
      const what = ({ overview: "employees", payroll: "readiness", runs: "run", leave: "leave", applicants: "candidates", recruitment: "jobs", jobs: "jobs", training: "training" } as Record<string, string>)[st.getState().tab] ?? "employees";
      modal({
        title: "Export",
        sub: "Sensitive fields follow your permissions; every export is audited.",
        primaryT: "Download",
        fields: [F("what", "Data", "select", { value: what, options: O([["employees", "Employees"], ["readiness", "Payroll readiness"], ["run", "Selected payroll run"], ["leave", "Leave requests"], ["candidates", "Candidates"], ["jobs", "Vacancies"], ["training", "Training assignments"]]) }), F("fmt", "Format", "select", { options: O([["csv", "CSV"], ["xlsx", "XLSX"]]) }), F("pii", "Sensitive fields", "select", { options: O(R?.salary || R?.pii ? [["mask", "Masked"], ["full", "Include salary / contact details (audited)"]] : [["mask", "Masked (required for your role)"]]) })],
        onSubmit: async (v) => void (await after(`${await ppApi.exportFile(sv(v, "what"), sv(v, "fmt"), sv(v, "pii"), scope())} row(s) exported.`)),
      });
    };

    // ── top-level keys ────────────────────────────────────────────────────
    const top = async (k: string): Promise<void> => {
      const s = st.getState();
      if (k === "refresh") return void (await refresh());
      if (k === "newjob") return need(R?.recruit, "Creating vacancies") ? jobModal() : undefined;
      if (k === "newcand") return need(R?.recruit, "Adding candidates") ? candModal() : undefined;
      if (k === "newint") return schedModal();
      if (k === "newoffer") return offerWizard(0, {});
      if (k === "newleave") return leaveModal();
      if (k === "emerg") return leaveModal(true);
      if (k === "newrule") return ruleModal();
      if (k === "assigntr") return assignTrModal();
      if (k === "newcourse") return courseModal();
      if (k === "newcycle") return cycleModal();
      if (k === "newgoal") return flash("Open a review and use “Add goal”.");
      if (k === "newofb") return ofbModal();
      if (k === "startpay" || k === "newrun") return startPay();
      if (k === "newcorr") return correctionModal();
      if (k === "deliverall") return run(async () => { const r = await ppApi.deliverAll(); return `${r.delivered} payslip(s) delivered${r.failed ? ` · ${r.failed} failed (no active login)` : ""}.`; });
      if (k === "export" || k.startsWith("export:")) return need(R?.export, "Export") ? exportModal() : undefined;
      if (k === "audit") return open("audit", "all");
      if (k === "myprofile") return profileModal(opt?.me.uid ?? "me");
      if (k.startsWith("set:")) return settingsModal(k.slice(4));
      if (k.startsWith("run:")) {
        const [, act, rid] = k.split(":");
        return runAct(act, rid ?? "");
      }
      if (k.startsWith("go:")) return go(k.slice(3));
      if (k === "ext:staff") return void router.push("/staff/overview");
      if (k.startsWith("clear:")) return st.getState().set({ f: { ...s.f, [k.slice(6)]: {} }, page: {} });
    };

    const rowAction = async (b: string, id: string, a: string): Promise<void> => {
      if (b === "ov-al") {
        const [g, ...rest] = id.split(":");
        const r = rest.slice(0, -1).join(":");
        const kind = ({ leave: "leave", offers: "offer", onboarding: "onb", offboarding: "ofb", interviews: "int" } as Record<string, string>)[g];
        if (kind && r) return open(kind, r);
        return go(g);
      }
      if (b === "ov-jl") return open("emp", id.split("|")[0]);
      if (b === "lv-b") return open("emp", id);
      if (b === "ov-lv" || b === "lv") return lvAct(id, a);
      if (b === "rc-job" || b === "job") return jobAct(id, a);
      if (b === "app" || b === "app-b") return appAct(id, a);
      if (b === "rc-int" || b === "int") return intAct(id, a);
      if (b === "int-sc") {
        const [iid, iv] = id.split("|");
        if (a === "Open scorecard") return open("int", iid);
        return scoreModal(iid, iv);
      }
      if (b === "off") return offAct(id, a);
      if (b === "onb") return onbAct(id, a);
      if (b === "ov-rd" || b === "pr-rd") return resolveModal(id);
      if (b === "pr-emp") {
        if (a === "Open calculation preview") return open("calc", id);
        if (a === "Edit payroll profile") return profileModal(id);
        if (a === "Resolve input") {
          const scr = await ppApi.screen({ ...scope(), tab: "payroll" });
          const rowsAll = (scr.rows ?? []).flatMap((g) => (g.blocks as { id?: string; table?: { rows?: { id: string }[] } }[]).filter((x) => x.id === "pr-rd").flatMap((x) => x.table?.rows ?? []));
          const hit = rowsAll.find((x) => x.id.split("|")[1]?.split(",").includes(id));
          return hit ? resolveModal(hit.id) : flash("Nothing to resolve for this person.");
        }
        return void router.push(a === "Open Staff timesheet" ? "/staff/timesheets" : a === "Open Staff commission" ? "/staff/commissions" : "/staff/advances");
      }
      if (b === "runs") return st.getState().set({ run: id, view: { ...st.getState().view, runTab: "sum" } });
      if (b === "run-e") return open("calc", id);
      if (b === "run-x") {
        const [rid, i] = id.split("|");
        if (a === "Resolve input") return go("payroll", { exc: "1" });
        return run(async () => ((await ppApi.runExc(rid, Number(i), a === "Exclude from run" ? "exclude" : "accept")), a === "Exclude from run" ? "Excluded from this run — pay them in a correction run once fixed." : "Warning accepted for this run."));
      }
      if (b === "ps") return psAct(id, a);
      if (b === "ben") return benAct(id, a);
      if (b === "ben-a") {
        const name = a.replace(/^(Assign|Remove) /, "");
        const r = (opt?.rules ?? []).find((x) => x.t === name);
        if (!r) return;
        return run(async () => ((await ppApi.ruleAssign(r.v, [id], a.startsWith("Assign"))), `${a.startsWith("Assign") ? "Assigned" : "Removed"} — applies from the next calculation.`));
      }
      if (b === "pf") return perfAct(id, a);
      if (b === "pf-g") {
        const [rid, i] = id.split("|");
        return pick("Update progress", "Progress", ["0", "25", "50", "75", "90", "100"].map((x) => ({ v: x, t: `${x}%` })), async (p) => ((await ppApi.reviewAct(rid, "progress", { idx: i, p })), "Progress updated."));
      }
      if (b === "pf-c") {
        if (a === "Close cycle") return confirm("Close cycle?", "No new reviews can be added.", "Close cycle", async () => ((await ppApi.cycleAct(id, "close")), "Cycle closed."), true);
        if (a === "Add reviews")
          return modal({ title: "Add reviews", sub: "Reviewer = the employee’s line manager (or you when none is set).", primaryT: "Add", fields: [F("ids", "Employees", "checks", { options: (opt?.team ?? []).map((m) => ({ v: m.v, t: m.t })) })], onSubmit: async (v) => void (await after(`${(await ppApi.cycleAct(id, "add", arr(v, "ids"))).added ?? 0} review(s) added.`)) });
        return;
      }
      if (b === "tr") return trAct(id, a);
      if (b === "tr-c") {
        if (a === "Bulk assign by department") return run(async () => { const r = await ppApi.assignTr({ courseId: id, byDept: true, dueDays: 14 }); return `Assigned to ${r.assigned}${r.skipped ? ` · ${r.skipped} already had it open` : ""}.`; });
        return assignTrModal({ course: id });
      }
      if (b === "ofb") return ofbAct(id, a);
    };

    const drawerAct = (k: string, kind: string, id: string, dv?: PpDrawer) => {
      const i = k.indexOf(":");
      const p = i < 0 ? k : k.slice(0, i);
      const v = i < 0 ? "" : k.slice(i + 1);
      const go2 = (fn: Promise<void> | void) => void Promise.resolve(fn).catch((e) => flash(errText(e)));
      if (p === "dc") return go2(appAct(id, v));
      if (p === "dj") return go2(jobAct(id, v));
      if (p === "di") return go2(intAct(id, v));
      if (p === "do") return go2(offAct(id, v));
      if (p === "dn") return go2(onbAct(id, ({ item: "item", tasks: "Create linked tasks", docs: "Request documents", edit: "edit", training: "Assign training" } as Record<string, string>)[v] ?? v));
      if (p === "dl") return go2(lvAct(id, v));
      if (p === "dv") return go2(perfAct(id, v));
      if (p === "dx") return go2(ofbAct(id, ({ tasks: "Create linked tasks", access: "Revoke access", asset: "Confirm asset return", final: "Link final payroll", docs: "Generate documents", item: "Mark item done", complete: "Complete" } as Record<string, string>)[v] ?? v));
      if (p === "db") return go2(benAct(id, v));
      if (p === "de") return go2(profileModal((dv?.ref as { uid?: string } | undefined)?.uid ?? id));
      if (p === "ds") {
        const r = dv?.ref as { runId: string; uid: string } | undefined;
        return r ? void dl(() => ppApi.slipPdf(r.runId, r.uid), "Payslip PDF") : undefined;
      }
      void kind;
      return go2(top(k));
    };

    const kpiClick = (k: string) => {
      const [p, x] = k.split(":");
      const s = st.getState();
      const G: Record<string, Record<string, [string, Record<string, string>, Record<string, string>?]>> = {
        o: { jobs: ["jobs", { st: "Published" }], apps: ["applicants", {}], leave: ["leave", {}, { lvView: "cal" }], due: ["payroll", {}], exc: ["payroll", { exc: "1" }], trn: ["training", { st: "Overdue" }] },
        r: { jobs: ["jobs", {}], apps: ["applicants", {}], int: ["interviews", { st: "Scheduled" }], off: ["offers", {}], hire: ["applicants", { stage: "Hired" }] },
      };
      const g = G[p]?.[x];
      if (g) return go(g[0], g[1], g[2]);
      const setF = (fk: string, f: Record<string, string>, view?: Record<string, string>) => st.getState().set({ f: { ...s.f, [fk]: f }, page: {}, ...(view ? { view: { ...s.view, ...view } } : {}) });
      if (p === "j") return setF("job", { st: x === "age" ? "" : x === "Open" ? "" : x, age: x === "age" ? "1" : "" });
      if (p === "a") return setF("app", { stage: x }, { appView: "table" });
      if (p === "i") return setF("int", { st: ["Scheduled", "Completed", "Feedback Overdue", "No-show"].includes(x) ? x : "" }, { intView: "list" });
      if (p === "f") return setF("off", { st: x === "exp" ? "Sent" : x });
      if (p === "l") return setF("lv", { st: x === "Submitted" ? "Submitted" : x === "up" ? "Approved" : "" }, { lvView: x === "low" ? "bal" : x === "today" ? "cal" : "req" });
      if (p === "p") return setF("pr", { exc: x === "exc" ? "1" : "" });
      if (p === "u") return st.getState().set({ view: { ...s.view, runTab: x === "exc" ? "exc" : "sum" } });
      if (p === "s") return setF("ps", { st: ["Generated", "Delivered", "Delivery Failed"].includes(x) ? x : "" });
      if (p === "b" && x !== "exp" && x !== "act") return st.getState().set({ view: { ...s.view, benView: x === "cov" ? "assign" : x === "up" ? "hist" : "rules" } });
      if (p === "v") return st.getState().set({ view: { ...s.view, perfView: x === "goal" ? "goals" : "reviews" } });
      if (p === "t") return setF("tr", { st: ["Assigned", "Overdue", "Completed"].includes(x) ? x : "" }, { trView: "assign" });
      if (p === "n") return void 0;
      if (p === "x") return void 0;
      return open("kpi", k);
    };

    const handlers: Omit<RenderHandlers, "sel"> = {
      kpiClick,
      blockAct: (k) => void top(k).catch((e: unknown) => flash(errText(e))),
      segPick: (b, k) => {
        const s = st.getState();
        const vk = VK[b];
        if (vk) st.getState().set({ view: { ...s.view, [vk]: k }, page: {} });
      },
      setQ: (b, v) => {
        const s = st.getState();
        const fb = FK[b] ?? b;
        st.getState().set({ f: { ...s.f, [fb]: { ...(s.f[fb] ?? {}), q: v } }, page: {} });
      },
      setF: (b, k, v) => {
        const s = st.getState();
        const fb = FK[b] ?? b;
        st.getState().set({ f: { ...s.f, [fb]: { ...(s.f[fb] ?? {}), [k]: v } }, page: {}, sel: [] });
      },
      clearF: (b) => {
        const s = st.getState();
        st.getState().set({ f: { ...s.f, [FK[b] ?? b]: {} }, page: {} });
      },
      pageGo: (d) => st.getState().set((s) => ({ page: { ...s.page, [s.tab]: Math.max(0, (s.page[s.tab] ?? 0) + d) } })),
      selRow: (id) => st.getState().set((s) => ({ sel: s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id] })),
      selAll: (ids) => st.getState().set({ sel: ids }),
      rowOpen: (b, id) => {
        const def: Record<string, string> = { "ov-al": "x", "ov-jl": "x", "ov-lv": "Open", "rc-job": "Open job", job: "Open job", "rc-int": "Open", int: "Open", app: "Open", "app-b": "Open", off: "Open", onb: "Open", lv: "Open", "lv-b": "x", "pr-emp": "Open calculation preview", runs: "x", "run-e": "x", ps: "Preview", ben: "Open", pf: "Open", ofb: "Open" };
        if (def[b]) void rowAction(b, id, def[b]).catch((e: unknown) => flash(errText(e)));
      },
      rowAct: (b, id, v) => void rowAction(b, id, v).catch((e: unknown) => flash(errText(e))),
      cardOpen: (b, id) => void rowAction(b, id, "Open").catch((e: unknown) => flash(errText(e))),
      calOpen: (_b, id) => open("leave", id),
    };

    return { handlers, top: (k: string) => void top(k).catch((e: unknown) => flash(errText(e))), drawerAct, after, flash, go };
  }, [opt, qc, router]);
}
