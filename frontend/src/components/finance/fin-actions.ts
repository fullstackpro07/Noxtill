"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { finApi, finDownload, type Boot, type Step } from "@/lib/finance-api";
import { ACCOUNT_TYPES, errText, hrefOf, money, num, r2, todayIso } from "./fin-core";
import { useFin, type JbLine, type ModalSpec } from "./fin-store";

const blankLine = (dim = ""): JbLine => ({ acct: "", desc: "", dr: "", cr: "", dim });

export function acctOptions(boot: Boot | undefined, filter?: (a: Boot["accounts"][number]) => boolean) {
  return (boot?.accounts ?? []).filter((a) => !a.header && a.active && (!filter || filter(a))).map((a) => ({ v: a.id, l: `${a.code} ${a.name}` }));
}

/** Every button in the Finance design routes through here to a real API call or a real form. */
export function useFinActions(boot: Boot | undefined, screen: string) {
  const router = useRouter();
  const qc = useQueryClient();
  const st = useFin;

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ["fin"] }), [qc]);

  const scopeQ = useCallback(() => {
    const s = st.getState();
    return { period: s.period || undefined, branch: s.branch, cur: s.cur };
  }, [st]);

  /** Run a server operation with the progress card: steps are what the server checks; marks come from its answer. */
  const run = useCallback(
    async (title: string, steps: string[], fn: () => Promise<{ msg: string; steps?: Step[]; warn?: boolean; failed?: string } | string>, opts: { closeDrawer?: boolean } = {}) => {
      const s = st.getState();
      s.startPipe(title, steps);
      st.setState({ modal: null, jb: null, bill: null });
      try {
        const r = await fn();
        const res = typeof r === "string" ? { msg: r } : r;
        if (res.failed) s.failPipe(res.failed, res.steps);
        else s.finishPipe(res.msg, res.warn ? "warn" : "ok", res.steps);
        if (opts.closeDrawer !== false) st.setState({ drawer: null });
      } catch (e) {
        s.failPipe(errText(e));
      } finally {
        await invalidate();
      }
    },
    [st, invalidate],
  );

  const go = useCallback(
    (k: string, seg?: string) => {
      st.setState((s) => ({ drawer: null, modal: null, moreF: false, q: "", reconId: null, seg: seg ? { ...s.seg, [k]: seg } : s.seg }));
      router.push(hrefOf(k));
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    },
    [router, st],
  );

  const openRec = useCallback(
    (k: string, id: string) => {
      if (k !== screen) router.push(hrefOf(k));
      st.setState({ drawer: { k, id, tab: null } });
    },
    [router, screen, st],
  );

  const reasonModal = useCallback(
    (title: string, intro: string, label: string, kind: "p" | "d", fn: (reason: string) => Promise<string | { msg: string; warn?: boolean }>, steps: string[], fieldLabel = "Reason") => {
      st.getState().openModal({
        title,
        intro,
        fields: [{ k: "reason", l: fieldLabel, type: "area", req: true, ph: "Recorded in the audit trail" }],
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          { l: label, kind, req: ["reason"], run: (mf) => run(title, steps, () => fn(mf.reason)) },
        ],
      });
    },
    [st, run],
  );

  const attachModal = useCallback(
    (type: string, id: string) => {
      st.getState().openModal({
        title: "Attach evidence",
        intro: "PDF, image, CSV, XLSX or ZIP up to 10 MB. Files are stored with this record and listed under Evidence.",
        fields: [{ k: "file", l: "File", type: "file", req: true, accept: ".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xlsx,.zip" }],
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: "Attach",
            kind: "p",
            req: ["file"],
            run: (_mf, files) =>
              run("Attaching evidence", ["Check file type and size", "Store document", "Audit logged"], async () => {
                const f = await finApi.attach(type, id, files.file!);
                return `${f.name} attached.`;
              }, { closeDrawer: false }),
          },
        ],
      });
    },
    [st, run],
  );

  // ── journals ─────────────────────────────────────────────────────────────

  const openJB = useCallback(
    async (id?: string | null, preset?: Partial<ReturnType<typeof st.getState>["jb"]>) => {
      if (id) {
        const j = await fetchJournalForEdit(id);
        st.setState({
          drawer: null,
          jb: {
            id,
            number: j.number,
            v: j.version,
            date: j.date.slice(0, 10),
            ref: j.reference ?? "",
            memo: j.memo ?? "",
            type: j.type,
            branch: j.branchId ?? "",
            currency: j.currency,
            lines: j.lines.map((l) => ({ acct: l.accountId ?? "", desc: l.description ?? "", dr: Number(l.txnDebit) ? String(Number(l.txnDebit)) : "", cr: Number(l.txnCredit) ? String(Number(l.txnCredit)) : "", dim: l.department ?? "" })),
          },
        });
        return;
      }
      st.setState({ drawer: null, modal: null, jb: { id: null, v: 1, date: todayIso(), ref: "", memo: "", type: "Adjustment", branch: "", currency: boot?.base ?? "USD", lines: [blankLine(), blankLine()], ...(preset ?? {}) } as never });
    },
    [st, boot],
  );

  const submitJ = useCallback(
    (id: string) =>
      run("Submitting journal", ["Validate balanced", "Validate open period", "Validate accounts & dimensions", "Route by approval threshold"], async () => {
        const r = await finApi.journalAction(id, "submit");
        return { msg: r.status === "Approval Required" ? "Submitted for approval. Not posted until an approver signs off — it also appears in Action Center." : "Sent for review. Once reviewed it can be posted.", steps: r.steps };
      }),
    [run],
  );

  const postJ = useCallback(
    (id: string) =>
      run("Posting journal", ["Validate balanced", "Validate accounts", "Validate open period", "Validate approval", "Commit all lines"], async () => {
        const r = await finApi.journalAction(id, "post");
        if (!r.ok) return { msg: "", failed: `Nothing was committed. ${r.journal?.failureReason ?? ""}`, steps: r.steps };
        return { msg: `${r.journal?.number} posted · lines committed to the ledger.`, steps: r.steps };
      }),
    [run],
  );

  const openApprove = useCallback(
    async (id: string) => {
      const rec = await finApi.record("journals", id, scopeQ());
      const s = st.getState();
      const why = rec.actions.find((a) => a.a === `approveJournal:${id}`);
      s.openModal({
        title: `Journal approval — ${rec.title}`,
        intro: why?.dis ? why.why : "Approving doesn’t post. Posting is a separate, audited step.",
        introTone: why?.dis ? "bad" : "info",
        kv: rec.kv.filter(([k]) => ["Journal date", "Type", "Reference", "Prepared by", "Period", "Source"].includes(k)).concat([["Amount", rec.amount]]),
        lines: rec.lines.map((l) => ({ acct: l.acct, dr: l.dr ? money(l.dr, rec.cur) : "", cr: l.cr ? money(l.cr, rec.cur) : "" })),
        fields: [{ k: "comment", l: "Comment", type: "area", ph: "Required to request changes" }],
        buttons: [
          { l: "Request Changes", kind: "s", req: ["comment"], run: (mf) => run("Returning to preparer", ["Record comment", "Return to draft"], async () => { await finApi.rejectJournal(id, mf.comment); return `${rec.title} returned to draft.`; }) },
          { l: "Approve", kind: "p", dis: !!why?.dis, why: why?.why, run: (mf) => run(`Approving ${rec.title}`, ["Check approver ≠ preparer", "Check approval threshold", "Record approval"], async () => { await finApi.approveJournal(id, mf.comment); return `${rec.title} approved. Ready to Post.`; }) },
        ],
      });
    },
    [st, run, scopeQ],
  );

  const openReverse = useCallback(
    async (id: string) => {
      const rec = await finApi.record("journals", id, scopeQ());
      const amt = num(rec.amount);
      const needs = amt >= (boot?.thresholds.journalDirect ?? 1000);
      st.getState().openModal({
        title: `Reverse journal ${rec.title}`,
        intro: "Posted journals can’t be edited. A reversal is a new journal with debits and credits swapped — the original stays unchanged and linked.",
        kv: [["Original journal", rec.title], ["Memo", rec.sub], ["Amount", rec.amount], ["Approval", needs ? "Required (Finance Manager or above)" : "Not required"]],
        lines: rec.lines.map((l) => ({ acct: l.acct, dr: l.cr ? money(l.cr, rec.cur) : "", cr: l.dr ? money(l.dr, rec.cur) : "" })),
        linesTitle: "Automatic reversal lines",
        fields: [{ k: "date", l: "Reversal date", type: "date", req: true }, { k: "reason", l: "Reason", type: "area", req: true, ph: "Why is this being reversed?" }],
        init: { date: todayIso() },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: needs ? "Submit Reversal for Approval" : "Post Reversal",
            kind: "p",
            req: ["date", "reason"],
            run: (mf) =>
              run("Creating reversal", ["Swap debits and credits", "Validate open period", needs ? "Create approval" : "Post reversal"], async () => {
                const r = await finApi.reverseJournal(id, mf.date, mf.reason);
                if (!r.ok) return { msg: "", failed: "The reversal couldn’t post — nothing was committed.", steps: r.steps };
                return { msg: r.reversal.status === "Approval Required" ? `${r.reversal.number} sent for approval. ${rec.title} stays Posted until the reversal posts.` : `${r.reversal.number} posted. ${rec.title} is Reversed — its lines are unchanged.`, steps: r.steps };
              }),
          },
        ],
      });
    },
    [st, run, boot, scopeQ],
  );

  // ── accounts ─────────────────────────────────────────────────────────────

  const accountModal = useCallback(
    async (id?: string) => {
      const existing = id ? boot?.accounts.find((a) => a.id === id) : null;
      const parents = (boot?.accounts ?? []).filter((a) => a.header).map((a) => ({ v: a.id, l: `${a.code} ${a.name}` }));
      const rec = id ? await finApi.record("coa", id, scopeQ()) : null;
      st.getState().openModal({
        title: existing ? `Edit account ${existing.code}` : "Add account",
        intro: existing?.control ? "Control account — edits need Owner / Controller approval. Code, type and currency can’t change once it has postings." : "Accounts can be deactivated later but never deleted.",
        introTone: existing?.control ? "warn" : "info",
        fields: [
          { k: "code", l: "Code", type: "text", req: true, ph: "6450" },
          { k: "name", l: "Name", type: "text", req: true, ph: "Software Subscriptions" },
          { k: "type", l: "Type", type: "sel", opts: ACCOUNT_TYPES.map(([v, l]) => ({ v, l })) },
          { k: "subtype", l: "Subtype", type: "text", ph: "Technology" },
          { k: "parentId", l: "Parent account", type: "sel", opts: [{ v: "", l: "None" }, ...parents] },
          ...(existing ? [] : [{ k: "currency", l: "Currency", type: "sel" as const, opts: [{ v: "", l: `${boot?.base ?? "USD"} (base)` }, ...["USD", "EUR", "GBP", "PKR", "AED", "SAR", "INR", "CAD", "AUD", "SGD"].filter((c) => c !== boot?.base).map((c) => ({ v: c, l: c }))] }]),
          { k: "reconcilable", l: "Allow reconciliation?", type: "sel", opts: ["No", "Yes"] },
          ...(existing ? [] : [{ k: "control", l: "Control account?", type: "sel" as const, opts: [{ v: "", l: "No" }, { v: "ar", l: "Yes — receivables" }, { v: "ap", l: "Yes — payables" }, { v: "tax", l: "Yes — tax" }, { v: "inventory", l: "Yes — inventory" }, { v: "fa", l: "Yes — fixed assets" }] }]),
          { k: "description", l: "Description", type: "area", ph: "When should this account be used?" },
        ],
        init: existing
          ? { code: existing.code, name: existing.name, type: existing.type, subtype: rec?.kv.find((x) => x[0] === "Subtype")?.[1] ?? "", parentId: "", reconcilable: rec?.kv.find((x) => x[0] === "Allow reconciliation")?.[1] === "Yes" ? "Yes" : "No", description: rec?.kv.find((x) => x[0] === "Description")?.[1].replace("—", "") ?? "" }
          : { type: "expense", currency: "", reconcilable: "No", control: "", parentId: parents.find((p) => p.l.startsWith("6000"))?.v ?? "" },
        live: (mf) => {
          if (!existing && mf.code && boot?.accounts.some((a) => a.code === mf.code)) return { t: `Code ${mf.code} is already in use.`, ok: false };
          if (mf.control) return { t: "Control accounts need Owner / Controller approval and get restricted edits once used.", ok: false };
          return mf.code ? { t: "Code available.", ok: true } : null;
        },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: existing ? (existing.control ? "Submit Change" : "Save Account") : "Create Account",
            kind: "p",
            req: ["code", "name"],
            run: (mf) =>
              run(existing ? `Updating ${mf.code}` : `Creating account ${mf.code}`, ["Validate code & hierarchy", "Policy check", "Save account"], async () => {
                const body: Record<string, unknown> = { code: mf.code, name: mf.name, type: mf.type, subtype: mf.subtype || undefined, parentId: mf.parentId || null, reconcilable: mf.reconcilable === "Yes", description: mf.description || null };
                if (existing) {
                  const r = await finApi.editAccount(existing.id, body);
                  return r.pending ? { msg: "Change sent for Owner / Controller approval. Nothing changes until approved.", warn: true } : `${mf.code} ${mf.name} saved.`;
                }
                const r = await finApi.addAccount({ ...body, currency: mf.currency || null, control: mf.control || null });
                return r.pending ? { msg: "Control account request sent for Owner / Controller approval.", warn: true } : `${mf.code} ${mf.name} created and active.`;
              }),
          },
        ],
      });
    },
    [boot, st, run, scopeQ],
  );

  // ── banking ──────────────────────────────────────────────────────────────

  const bankModal = useCallback(() => {
    const linkable = acctOptions(boot, (a) => a.type === "asset" && !boot?.bankAccounts.some((b) => b.glAccountId === a.id) && ["1120", "1150"].includes(a.code));
    st.getState().openModal({
      title: "Add bank or cash account",
      intro: "This creates the accounting account. Bring transactions in by importing statements, or link a payments provider whose payouts land here.",
      fields: [
        { k: "name", l: "Name", type: "text", req: true, ph: "Operating account" },
        { k: "kind", l: "Type", type: "sel", opts: [{ v: "bank", l: "Bank" }, { v: "cash", l: "Cash" }, { v: "card", l: "Credit card" }, { v: "wallet", l: "Wallet / e-money" }] },
        { k: "institution", l: "Institution", type: "text", ph: "First National Bank" },
        { k: "mask", l: "Last 4 digits", type: "text", ph: "4821" },
        { k: "currency", l: "Currency", type: "sel", opts: [boot?.base ?? "USD", ...["USD", "EUR", "GBP", "PKR", "AED", "SAR", "INR", "CAD", "AUD", "SGD"].filter((c) => c !== boot?.base)] },
        { k: "gl", l: "Linked GL account", type: "sel", opts: [{ v: "", l: "Create new under 1100 Cash & Bank" }, ...linkable] },
        { k: "payout", l: "Payouts from", type: "sel", opts: [{ v: "", l: "None — statements only" }, { v: "stripe", l: "Stripe" }, { v: "square", l: "Square" }, { v: "paypal", l: "PayPal" }] },
        { k: "branch", l: "Branch", type: "sel", opts: [{ v: "", l: "All / not branch-specific" }, ...(boot?.branches ?? []).map((b) => ({ v: b.id, l: b.name }))] },
        { k: "ob", l: "Opening balance", type: "number", ph: "0.00" },
        { k: "od", l: "Opening date", type: "date" },
      ],
      init: { kind: "bank", currency: boot?.base ?? "USD", gl: "", payout: "", branch: "", od: todayIso() },
      buttons: [
        { l: "Cancel", kind: "s", run: "close" },
        {
          l: "Add Account",
          kind: "p",
          req: ["name"],
          run: (mf) =>
            run(`Adding ${mf.name}`, ["Create GL account", "Link bank account", mf.ob ? "Post opening balance" : "Audit logged"], async () => {
              await finApi.addBank({ name: mf.name, kind: mf.kind, institution: mf.institution || undefined, mask: mf.mask || undefined, currency: mf.currency, glAccountId: mf.gl || null, payoutProvider: mf.payout || null, branchId: mf.branch || null, openingBalance: mf.ob ? num(mf.ob) : undefined, openingDate: mf.od || undefined });
              return `${mf.name} added${mf.ob ? ` with an opening balance of ${money(num(mf.ob), mf.currency)}` : ""}.`;
            }),
        },
      ],
    });
  }, [boot, st, run]);

  const importModal = useCallback(
    (bankId?: string) => {
      const banks = (boot?.bankAccounts ?? []).filter((b) => b.active);
      if (!banks.length) {
        st.getState().flash("Add a bank or cash account first — statements import into one.");
        return bankModal();
      }
      st.getState().openModal({
        title: "Import bank statement",
        intro: "CSV (Date + Amount or Debit/Credit columns) or OFX/QFX from your bank. Lines already imported are skipped automatically.",
        fields: [
          { k: "bank", l: "Bank account", type: "sel", opts: banks.map((b) => ({ v: b.id, l: `${b.name}${b.mask ? ` ••${b.mask}` : ""}` })) },
          { k: "file", l: "Statement file", type: "file", req: true, accept: ".csv,.ofx,.qfx,.txt" },
        ],
        init: { bank: bankId ?? banks[0].id },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: "Import",
            kind: "p",
            req: ["file"],
            run: (mf, files) =>
              run("Importing statement", ["Read file", "Skip duplicates", "Suggest matches"], async () => {
                const r = await finApi.importStatement(mf.bank, files.file!);
                return `${r.imported} new line${r.imported === 1 ? "" : "s"} imported${r.duplicates ? `, ${r.duplicates} duplicate${r.duplicates === 1 ? "" : "s"} skipped` : ""}${r.closing != null ? ` · closing balance ${money(r.closing, boot?.base)}` : ""}.`;
              }),
          },
        ],
      });
    },
    [boot, st, run, bankModal],
  );

  const ruleModal = useCallback(
    (lineDesc?: string) => {
      st.getState().openModal({
        title: "Create bank rule",
        intro: "Rules re-check every open bank line now and apply to new imports. Suggest-only rules never change anything without you.",
        fields: [
          { k: "name", l: "Rule name", type: "text", req: true, ph: "Bank fees" },
          { k: "c", l: "Description contains", type: "text", req: true, ph: "SERVICE FEE" },
          { k: "dir", l: "Direction", type: "sel", opts: [{ v: "any", l: "Money in or out" }, { v: "out", l: "Money out" }, { v: "in", l: "Money in" }] },
          { k: "acct", l: "Account", type: "sel", opts: acctOptions(boot) },
          { k: "tax", l: "Tax code", type: "sel", opts: [{ v: "", l: "No tax" }, ...(boot?.taxCodes ?? []).map((t) => ({ v: t.code, l: `${t.code} · ${t.name}` }))] },
          { k: "mode", l: "Mode", type: "sel", opts: [{ v: "suggest", l: "Suggest only" }, { v: "auto", l: "Match automatically (Finance Manager)" }] },
        ],
        init: { name: "", c: lineDesc ? lineDesc.split(/\s+/).slice(0, 2).join(" ") : "", dir: "any", acct: acctOptions(boot, (a) => a.systemKey === "bank_fees")[0]?.v ?? "", tax: "", mode: "suggest" },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: "Save Rule",
            kind: "p",
            req: ["name", "c", "acct"],
            run: (mf) =>
              run("Saving rule", ["Validate account & tax mapping", "Save rule", "Re-check open bank lines"], async () => {
                const r = await finApi.createRule({ name: mf.name, contains: mf.c, direction: mf.dir, accountId: mf.acct, taxCode: mf.tax || null, mode: mf.mode });
                return `Rule saved: “${mf.c}”. ${r.rescanned} open line${r.rescanned === 1 ? "" : "s"} re-checked.`;
              }),
          },
        ],
      });
    },
    [boot, st, run],
  );

  const chooseDiff = useCallback(
    async (lineId: string) => {
      const c = await finApi.candidates(lineId);
      const rec = await finApi.record("feeds", lineId, scopeQ());
      const amt = num(rec.amount.replace(/[^\d.\-−]/g, "").replace("−", "-"));
      const ledgerOpts = c.ledger.map((l) => ({ v: `L:${l.id}`, l: `${l.journal} · ${l.label ?? ""} · ${money(l.amount, rec.cur)}${r2(l.amount) === r2(amt) ? " (amount agrees)" : ""}` }));
      st.getState().openModal({
        title: "Choose a different record",
        intro: "Pick an existing ledger entry on this bank account, or categorize the line to an account (that posts a new journal). Bills are paid with Record Payment on the bill, then matched here.",
        fields: [
          { k: "rec", l: "Match to", type: "sel", opts: [...ledgerOpts, ...acctOptions(boot).map((a) => ({ v: `A:${a.v}`, l: `New entry → ${a.l}` }))] },
          { k: "tax", l: "Tax code (new entry only)", type: "sel", opts: [{ v: "", l: "No tax" }, ...(boot?.taxCodes ?? []).map((t) => ({ v: t.code, l: `${t.code} · ${t.name}` }))] },
        ],
        init: { rec: ledgerOpts[0]?.v ?? `A:${acctOptions(boot)[0]?.v ?? ""}`, tax: "" },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: "Match",
            kind: "p",
            req: ["rec"],
            run: (mf) =>
              run("Matching bank line", ["Check amount & date", "Link bank line", "Audit logged"], async () => {
                const [t, v] = [mf.rec.slice(0, 1), mf.rec.slice(2)];
                await finApi.match(lineId, t === "L" ? { lineIds: [v] } : { accountId: v, taxCode: mf.tax || null });
                return "Matched. Nothing was marked paid — payments are recorded where they happen.";
              }),
          },
        ],
      });
    },
    [boot, st, run, scopeQ],
  );

  const splitModal = useCallback(
    async (lineId: string) => {
      const rec = await finApi.record("feeds", lineId, scopeQ());
      const amt = Math.abs(num(rec.amount.replace("−", "-")));
      const opts = acctOptions(boot);
      st.getState().openModal({
        title: `Split ${rec.title}`,
        intro: `Split one bank line across accounts. The total must equal the bank amount of ${money(amt, rec.cur)}.`,
        fields: [
          { k: "a1", l: "Line 1 — account", type: "sel", opts },
          { k: "v1", l: "Line 1 amount", type: "number" },
          { k: "a2", l: "Line 2 — account", type: "sel", opts },
          { k: "v2", l: "Line 2 amount", type: "number" },
          { k: "a3", l: "Line 3 — account (optional)", type: "sel", opts: [{ v: "", l: "—" }, ...opts] },
          { k: "v3", l: "Line 3 amount", type: "number" },
        ],
        init: { a1: opts[0]?.v ?? "", a2: opts.find((o) => o.l.includes("Bank Fees"))?.v ?? opts[0]?.v ?? "", a3: "" },
        live: (mf) => {
          const rem = r2(amt - num(mf.v1) - num(mf.v2) - (mf.a3 ? num(mf.v3) : 0));
          return rem === 0 ? { t: `Split total equals bank amount ${money(amt, rec.cur)}.`, ok: true } : { t: `Remaining to allocate: ${money(rem, rec.cur)}`, ok: false };
        },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: "Split & Match",
            kind: "p",
            req: ["v1", "v2"],
            run: (mf) => {
              const parts = [{ accountId: mf.a1, amount: num(mf.v1) }, { accountId: mf.a2, amount: num(mf.v2) }, ...(mf.a3 && num(mf.v3) ? [{ accountId: mf.a3, amount: num(mf.v3) }] : [])];
              const rem = r2(amt - parts.reduce((s, p) => s + p.amount, 0));
              if (rem !== 0) {
                st.setState({ mErr: `Split total must equal the bank amount. ${money(Math.abs(rem), rec.cur)}${rem > 0 ? " still unallocated." : " over-allocated."}` });
                return;
              }
              return run(`Splitting ${rec.title}`, ["Validate split total", "Post split journal", "Record match"], async () => {
                await finApi.split(lineId, parts);
                return `Split into ${parts.length} lines and matched.`;
              });
            },
          },
        ],
      });
    },
    [boot, st, run, scopeQ],
  );

  const startReconModal = useCallback(
    (bankId?: string) => {
      const banks = (boot?.bankAccounts ?? []).filter((b) => b.active);
      if (!banks.length) {
        st.getState().flash("Add a bank or cash account first.");
        return bankModal();
      }
      st.getState().openModal({
        title: "Start reconciliation",
        intro: "Enter the closing balance from the bank statement. Finance compares it with the lines you’ve matched; the difference must reach zero before approval.",
        fields: [
          { k: "bank", l: "Account", type: "sel", opts: banks.map((b) => ({ v: b.id, l: `${b.name}${b.mask ? ` ••${b.mask}` : ""}` })) },
          { k: "end", l: "Statement end date", type: "date", req: true },
          { k: "bal", l: "Statement closing balance", type: "number", req: true, ph: "0.00" },
        ],
        init: { bank: bankId ?? banks[0].id, end: todayIso() },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: "Start",
            kind: "p",
            req: ["end", "bal"],
            run: async (mf) => {
              try {
                const r = await finApi.startRecon({ bankAccountId: mf.bank, periodEnd: mf.end, statementBalance: num(mf.bal) });
                st.setState({ modal: null, reconId: r.id });
                router.push(hrefOf("recon"));
                await invalidate();
              } catch (e) {
                st.setState({ mErr: errText(e) });
              }
            },
          },
        ],
      });
    },
    [boot, st, router, invalidate, bankModal],
  );

  // ── bills ────────────────────────────────────────────────────────────────

  const openBill = useCallback(
    async (method: "Manual" | "Upload" | "Photo Digitizer" | "Email import", id?: string) => {
      const blank = { desc: "", acct: acctOptions(boot, (a) => a.systemKey === "general")[0]?.v ?? "", qty: "1", unit: "", amt: "", tax: "", poItemId: "" };
      if (id) {
        const b = await finApi.bill(id);
        st.setState({
          drawer: null,
          bill: { id, method: (b.intake as "Manual") ?? "Manual", vendor: b.vendorName, supplierId: b.supplierId ?? "", vinv: b.vendorInvoiceNo ?? "", date: b.billDate.slice(0, 10), due: b.dueDate.slice(0, 10), po: b.purchaseOrderId ?? "", currency: b.currency, branch: b.branchId ?? "", lines: b.lines.map((l) => ({ desc: l.description, acct: l.accountId, qty: String(Number(l.qty)), unit: String(Number(l.unitCost)), amt: String(Number(l.amount)), tax: l.taxCode ?? "", poItemId: l.poItemId ?? "" })), notes: b.notes ?? "", attachment: null, conf: null, basis: "", scanning: false, scanErr: "", ocr: null },
        });
        return;
      }
      st.setState({ drawer: null, bill: { id: null, method, vendor: "", supplierId: "", vinv: "", date: todayIso(), due: todayIso(), po: "", currency: boot?.base ?? "USD", branch: "", lines: [blank], notes: "", attachment: null, conf: null, basis: "", scanning: false, scanErr: "", ocr: null } });
    },
    [boot, st],
  );

  const payModal = useCallback(
    async (id: string) => {
      const rec = await finApi.record("bills", id, scopeQ());
      const open = num((rec.kv.find((k) => k[0] === "Open balance")?.[1] ?? "0").replace("−", "-"));
      const banks = (boot?.bankAccounts ?? []).filter((b) => b.active);
      st.getState().openModal({
        title: `Record payment — ${rec.title}`,
        intro: "Record a payment you made outside Noxtill (transfer, cheque or cash). It relieves A/P and credits the bank; match the bank line later in Bank Feeds.",
        kv: [["Open balance", money(open, rec.cur)], ["Vendor", rec.kv.find((k) => k[0] === "Vendor")?.[1] ?? ""]],
        fields: [
          { k: "bank", l: "Paid from", type: "sel", opts: banks.map((b) => ({ v: b.id, l: `${b.name}${b.mask ? ` ••${b.mask}` : ""} · ${b.currency}` })) },
          { k: "date", l: "Payment date", type: "date", req: true },
          { k: "amt", l: "Amount", type: "number", req: true },
          { k: "ref", l: "Reference", type: "text", ph: "Transfer / cheque number" },
        ],
        init: { bank: banks[0]?.id ?? "", date: todayIso(), amt: String(open) },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: "Record Payment",
            kind: "p",
            req: ["bank", "date", "amt"],
            run: (mf) =>
              run("Recording payment", ["Check open balance", "Post A/P settlement", "Book any FX difference"], async () => {
                await finApi.billAction(id, "pay", { bankAccountId: mf.bank, date: mf.date, amount: num(mf.amt), reference: mf.ref || undefined });
                return `Payment of ${money(num(mf.amt), rec.cur)} recorded.`;
              }),
          },
        ],
      });
    },
    [boot, st, run, scopeQ],
  );

  // ── assets, budgets, tax, close, settings ───────────────────────────────

  const capitalizeModal = useCallback(
    (billId?: string) => {
      const funding = acctOptions(boot, (a) => a.type === "asset" || a.type === "liability");
      st.getState().openModal({
        title: "Capitalize asset",
        intro: billId ? "This bill was posted to Fixed Assets — Cost. Capitalizing adds it to the register so it starts depreciating; no new journal is needed." : "Adds the asset to the register and posts Dr Fixed Assets — Cost / Cr the account it was paid from.",
        fields: [
          { k: "name", l: "Asset", type: "text", req: true, ph: "Delivery van" },
          { k: "cat", l: "Class", type: "sel", opts: ["Leasehold Improvements", "Vehicles", "Equipment", "Furniture & Fixtures", "IT Equipment", "Buildings", "Other"] },
          { k: "acq", l: "Acquired on", type: "date", req: true },
          { k: "svc", l: "In service from", type: "date", req: true },
          { k: "cost", l: "Cost", type: "number", req: true },
          { k: "salv", l: "Salvage value", type: "number" },
          { k: "life", l: "Useful life (months)", type: "number", req: true },
          { k: "m", l: "Depreciation method", type: "sel", opts: [{ v: "straight_line", l: "Straight-line" }, { v: "declining", l: "Double-declining balance" }] },
          ...(billId ? [] : [{ k: "fund", l: "Paid from", type: "sel" as const, opts: funding }]),
          { k: "loc", l: "Location", type: "text", ph: "Main store" },
          { k: "branch", l: "Branch", type: "sel", opts: [{ v: "", l: "Not branch-specific" }, ...(boot?.branches ?? []).map((b) => ({ v: b.id, l: b.name }))] },
        ],
        init: { cat: "Equipment", acq: todayIso(), svc: todayIso(), life: "60", m: "straight_line", salv: "0", fund: funding.find((f) => f.l.startsWith("2100"))?.v ?? funding[0]?.v ?? "", branch: "" },
        live: (mf) => {
          const c = num(mf.cost);
          const s = num(mf.salv);
          const l = num(mf.life);
          return l > 0 && c > s ? { t: `Monthly depreciation ${money(r2((c - s) / l), boot?.base)}${mf.m === "declining" ? " in month one, then falling" : ""}.`, ok: true } : { t: "Enter a cost above salvage and a useful life.", ok: false };
        },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          {
            l: "Capitalize",
            kind: "p",
            req: ["name", "cost", "life", "acq", "svc"],
            run: (mf) =>
              run(`Capitalizing ${mf.name}`, ["Validate cost & life", billId ? "Link the posted bill" : "Post capitalization journal", "Add to register"], async () => {
                const a = await finApi.capitalize({ name: mf.name, category: mf.cat, acquiredOn: mf.acq, inServiceOn: mf.svc, cost: num(mf.cost), salvage: num(mf.salv), lifeMonths: Math.round(num(mf.life)), method: mf.m, fundingAccountId: billId ? null : mf.fund, billId: billId ?? null, location: mf.loc || undefined, branchId: mf.branch || null });
                return `${a.number} ${mf.name} capitalized.`;
              }),
          },
        ],
      });
    },
    [boot, st, run],
  );

  const runDepModal = useCallback(async () => {
    const s = st.getState();
    const period = /^\d{4}-\d{2}$/.test(s.period) ? s.period : todayIso().slice(0, 7);
    const pv = await finApi.depPreview(period);
    s.openModal({
      title: "Run depreciation — preview",
      intro: pv.run ? "Depreciation for this month is already posted." : pv.blocked ?? "Preview only. Nothing posts until you confirm.",
      introTone: pv.run || pv.blocked ? "warn" : "info",
      kv: [["Period", period], ["Assets included", String(pv.rows.length)], ["Total depreciation", money(pv.total, boot?.base)], ["Accounts", "Depreciation Expense / Accumulated Depreciation"]],
      lines: pv.rows.map((r) => ({ acct: `${r.number} ${r.name}`, dr: money(r.dep, boot?.base), cr: "" })),
      linesTitle: "Charge per asset",
      buttons: [
        { l: "Close", kind: "s", run: "close" },
        { l: "Post Depreciation", kind: "p", dis: !!pv.run || !!pv.blocked || !pv.rows.length, why: pv.run ? "Already posted" : pv.blocked ?? (!pv.rows.length ? "Nothing is due" : ""), run: () => run("Posting depreciation", ["Compute per-asset charge", "Validate open period", "Post journal"], async () => { const r = await finApi.depRun(period); return `${r.journal.number} posted · ${r.assets} assets · ${money(r.total, boot?.base)}.`; }) },
      ],
    });
  }, [boot, st, run]);

  const budgetModal = useCallback(() => {
    const fy = new Date().getUTCFullYear();
    st.getState().openModal({
      title: "Create budget",
      intro: "New budgets start as Draft. Approved versions are never overwritten — changes create a revision.",
      fields: [
        { k: "name", l: "Name", type: "text", req: true, ph: `FY${fy + 1} Original Budget` },
        { k: "fy", l: "Financial year", type: "sel", opts: [String(fy - 1), String(fy), String(fy + 1)] },
        { k: "base", l: "Start from", type: "sel", opts: [{ v: "empty", l: "Blank" }, { v: "actuals", l: "Prior year posted actuals" }] },
        { k: "up", l: "Uplift %", type: "number", ph: "0" },
        { k: "branch", l: "Branch", type: "sel", opts: [{ v: "", l: "All branches" }, ...(boot?.branches ?? []).map((b) => ({ v: b.id, l: b.name }))] },
      ],
      init: { name: `FY${fy} Budget`, fy: String(fy), base: "actuals", up: "0", branch: "" },
      buttons: [
        { l: "Cancel", kind: "s", run: "close" },
        { l: "Create Draft", kind: "p", req: ["name"], run: (mf) => run("Creating budget", ["Validate accounts", "Generate monthly periods", "Save as Draft"], async () => { const b = await finApi.createBudget({ name: mf.name, fiscalYear: Number(mf.fy), basis: mf.base, upliftPct: num(mf.up), branchId: mf.branch || null }); st.setState({ bver: b.id }); return `“${b.name}” v${b.version} created as Draft.`; }) },
      ],
    });
  }, [boot, st, run]);

  const importBudgetModal = useCallback(() => {
    const fy = new Date().getUTCFullYear();
    st.getState().openModal({
      title: "Import budget spreadsheet",
      intro: "XLSX or CSV with columns Account, Month, Amount (optional Department) — or Account plus one column per month. Every row is validated; nothing is saved if a row is invalid. Imports always land as Draft.",
      fields: [
        { k: "name", l: "Name", type: "text", req: true, ph: `FY${fy} Imported Budget` },
        { k: "fy", l: "Financial year", type: "sel", opts: [String(fy - 1), String(fy), String(fy + 1)] },
        { k: "file", l: "File", type: "file", req: true, accept: ".xlsx,.csv" },
      ],
      init: { name: `FY${fy} Imported Budget`, fy: String(fy) },
      buttons: [
        { l: "Cancel", kind: "s", run: "close" },
        {
          l: "Validate & Import",
          kind: "p",
          req: ["name", "file"],
          run: async (mf, files) => {
            st.setState({ mBusy: true });
            try {
              const r = await finApi.importBudget(files.file!, mf.name, Number(mf.fy));
              if (r.errors.length) {
                st.setState({ mErr: `${r.errors.length} problem${r.errors.length === 1 ? "" : "s"} — nothing imported. ${r.errors.slice(0, 4).join(" ")}`, mBusy: false });
                return;
              }
              st.setState({ modal: null, mBusy: false, bver: r.created!.id });
              st.getState().flash(`${r.rows} rows imported as Draft “${r.created!.name}” v${r.created!.version}.`);
              await invalidate();
            } catch (e) {
              st.setState({ mErr: errText(e), mBusy: false });
            }
          },
        },
      ],
    });
  }, [st, invalidate]);

  const closeStartModal = useCallback(() => {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const opts = [prev, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))].map((d) => ({ v: d.toISOString().slice(0, 7), l: d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) }));
    st.getState().openModal({
      title: "Start close",
      intro: "Creates the month-end checklist from your close policy and assigns its controls to you. Each control is checked against the books.",
      fields: [{ k: "p", l: "Period", type: "sel", opts }],
      init: { p: opts[0].v },
      buttons: [
        { l: "Cancel", kind: "s", run: "close" },
        { l: "Start Close", kind: "p", run: (mf) => run("Starting close", ["Create checklist from policy", "Assign controls", "Run control checks"], async () => { await finApi.startClose(mf.p); st.setState({ period: mf.p }); return `${opts.find((o) => o.v === mf.p)?.l} close started.`; }) },
      ],
    });
  }, [st, run]);

  const closeDoneModal = useCallback(
    (taskId: string) =>
      st.getState().openModal({
        title: "Complete control",
        intro: "Your close policy may require evidence. Attach a file from the control’s Evidence tab, or write what was checked here.",
        fields: [{ k: "note", l: "Evidence note", type: "area", ph: "What was checked, and where the evidence is" }],
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          { l: "Mark Complete", kind: "p", run: (mf) => run("Completing control", ["Re-check control", "Check evidence", "Complete control"], async () => { await finApi.taskAction(taskId, "complete", { note: mf.note || undefined }); return "Control completed."; }) },
        ],
      }),
    [st, run],
  );

  const reopenPeriodModal = useCallback(
    (key: string) => {
      const label = new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
      const admin = !!boot?.actor.admin;
      st.getState().openModal({
        title: `${admin ? "Reopen" : "Request reopen"} — ${label}`,
        intro: admin ? "Reopening allows normal postings again until the period is re-locked. It’s recorded in the audit trail." : "Only an Owner / Controller can reopen. Your request appears in their approvals and Action Center.",
        introTone: "warn",
        kv: [["Period", label], ["Impact", "Normal postings allowed until re-locked"], ["Reports affected", "P&L, Balance Sheet, Cash Flow, tax returns for the month"], ["Approval", "Owner / Controller"]],
        fields: [{ k: "reason", l: "Reason", type: "area", req: true, ph: "What needs to be corrected and why?" }],
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          { l: admin ? "Reopen Period" : "Request Reopen", kind: "p", req: ["reason"], run: (mf) => run(admin ? "Reopening period" : "Requesting reopen", ["Permission check", admin ? "Reopen period" : "Create reopen approval", "Audit logged"], async () => { const r = await finApi.reopenPeriod(key, mf.reason); return r.requested ? { msg: `${label} reopen requested. It stays locked until approved.`, warn: true } : `${label} is open again.`; }) },
        ],
      });
    },
    [boot, st, run],
  );

  const inviteModal = useCallback(() => {
    const exp = new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31)).toISOString().slice(0, 10);
    st.getState().openModal({
      title: "Invite accountant",
      intro: "Access is scoped and expires. They sign in to Noxtill with a Finance-only role; nothing outside Finance is shown to them.",
      fields: [
        { k: "name", l: "Name", type: "text", req: true, ph: "Jordan Blake" },
        { k: "email", l: "Email", type: "text", req: true, ph: "jordan@firm.com" },
        { k: "firm", l: "Firm", type: "text", ph: "Blake Advisory" },
        { k: "scope", l: "Branch scope", type: "sel", opts: [{ v: "", l: "All branches" }, ...(boot?.branches ?? []).map((b) => ({ v: b.id, l: `${b.name} only` }))] },
        { k: "perm", l: "Permissions", type: "sel", opts: [{ v: "Read only", l: "Read · Export" }, { v: "Prepare", l: "Read · Create Draft · Reconcile · Export" }, { v: "Approve", l: "Read · Draft · Approve · Post" }] },
        { k: "exp", l: "Expires on", type: "date", req: true },
      ],
      init: { scope: "", perm: "Prepare", exp },
      buttons: [
        { l: "Cancel", kind: "s", run: "close" },
        {
          l: "Send Invite",
          kind: "p",
          req: ["name", "email", "exp"],
          run: async (mf) => {
            st.setState({ mBusy: true });
            try {
              const r = await finApi.invite({ name: mf.name, email: mf.email, firm: mf.firm || undefined, permission: mf.perm, branches: mf.scope ? [mf.scope] : [], expiresOn: mf.exp });
              await invalidate();
              st.getState().openModal({
                title: "Accountant invited",
                intro: r.tempPassword ? `${mf.email} can sign in with this temporary password. It’s shown only once — share it securely.` : `${mf.email} already has a Noxtill login; they can sign in now and will see Finance.`,
                kv: r.tempPassword ? [["Email", mf.email], ["Temporary password", r.tempPassword]] : [["Email", mf.email]],
                buttons: [{ l: "Done", kind: "p", run: "close" }],
              });
            } catch (e) {
              st.setState({ mErr: errText(e), mBusy: false });
            }
          },
        },
      ],
    });
  }, [boot, st, invalidate]);

  const rateModal = useCallback(
    () =>
      st.getState().openModal({
        title: "Add exchange rate",
        intro: `How many ${boot?.base ?? "base"} one unit of the foreign currency is worth, from a date. Postings in that currency on or after it use this rate.`,
        fields: [
          { k: "cur", l: "Currency", type: "text", req: true, ph: "EUR" },
          { k: "rate", l: `Rate (1 unit = ? ${boot?.base ?? ""})`, type: "number", req: true },
          { k: "on", l: "Effective from", type: "date", req: true },
          { k: "note", l: "Source", type: "text", ph: "e.g. central bank close" },
        ],
        init: { on: todayIso() },
        buttons: [
          { l: "Cancel", kind: "s", run: "close" },
          { l: "Save Rate", kind: "p", req: ["cur", "rate", "on"], run: (mf) => run("Saving rate", ["Validate rate", "Save rate", "Audit logged"], async () => { await finApi.setRate({ currency: mf.cur.toUpperCase(), rate: num(mf.rate), effectiveOn: mf.on, note: mf.note || undefined }); await finApi.sweep(false); return `1 ${mf.cur.toUpperCase()} = ${mf.rate} ${boot?.base} from ${mf.on}. Waiting postings retried.`; }) },
        ],
      }),
    [boot, st, run],
  );

  // ── dispatcher ───────────────────────────────────────────────────────────

  const act = useCallback(
    async (a: string) => {
      if (!a) return;
      const ix = a.indexOf(":");
      const cmd = ix < 0 ? a : a.slice(0, ix);
      const arg = ix < 0 ? "" : a.slice(ix + 1);
      const s = st.getState();
      try {
        switch (cmd) {
          case "go":
            return go(arg);
          case "goseg": {
            const [k, sg] = arg.split("|");
            return go(k, sg);
          }
          case "seg":
            return st.setState((x) => ({ seg: { ...x.seg, [screen]: arg } }));
          case "openRec": {
            const [k, id] = arg.split("|");
            return openRec(k, id);
          }
          case "openRecon":
            st.setState({ drawer: null, reconId: arg || null });
            return router.push(hrefOf("recon"));
          case "link":
            return router.push(arg);
          case "drill":
            return openRec("statements", arg);
          case "glAccount":
            st.setState({ drawer: null, glAccount: arg });
            return router.push(hrefOf("gl"));
          case "stmt":
            st.setState({ drawer: null, stmt: arg });
            return router.push(hrefOf("statements"));
          case "flash":
            return s.flash(arg);
          case "sweep":
            return run("Posting run", ["Read sales, payments, credit and returns", "Read stock, expenses, cash and deposits", "Post new and changed records"], async () => {
              const r = await finApi.sweep(false);
              const n = r.sweep.posted + r.sweep.reposted + r.sweep.reversed;
              return r.sweep.errors.length ? { msg: `${n} journal${n === 1 ? "" : "s"} posted. ${r.sweep.errors[0]}`, warn: true } : `${n} journal${n === 1 ? "" : "s"} posted${r.payouts ? `, ${r.payouts} payout${r.payouts === 1 ? "" : "s"} pulled into bank feeds` : ""}. Ledger is up to date.`;
            });
          case "reviewActions": {
            const el = document.getElementById("nxf-att");
            if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
            return;
          }
          case "export":
          case "exportStmt": {
            const key = cmd === "exportStmt" ? "statements" : screen;
            const fmt = arg || (cmd === "exportStmt" ? "pdf" : "csv");
            const q: Record<string, unknown> = { ...scopeQ(), format: fmt };
            if (key === "statements") Object.assign(q, { stmt: s.stmt, cmp: s.cmp ? "1" : "0" });
            if (key === "gl") Object.assign(q, { account: s.glAccount || undefined, source: s.glSource || undefined });
            if (key === "budgets") Object.assign(q, { bver: s.bver || undefined });
            const name = await finDownload(`/export/${key}`, q);
            return s.flash(`${name} downloaded. Exports are logged in the audit trail.`);
          }
          case "exportJournal":
            return s.flash(`${await finDownload(`/export/journal/${arg}`, { format: "csv" })} downloaded.`);
          case "exportAccount":
            st.setState({ glAccount: arg });
            return s.flash(`${await finDownload("/export/gl", { ...scopeQ(), account: arg, format: "csv" })} downloaded.`);
          case "exportTax":
            return s.flash(`${await finDownload(`/export/tax/${arg}`, { format: "xlsx" })} downloaded (filing pack).`);
          case "exploreLedger": {
            st.setState({ moreF: true });
            document.getElementById("nxfq")?.focus();
            return;
          }
          case "viewStatements":
            st.setState({ stmt: "pl" });
            document.getElementById("nxf-stmt")?.scrollIntoView({ behavior: "smooth" });
            return;
          case "attach": {
            const [type, id] = arg.split(":");
            return attachModal(type, id);
          }
          // journals
          case "newJournal":
            return openJB();
          case "editJournal":
            return openJB(arg);
          case "adjustJournal": {
            const rec = await finApi.record("journals", arg, scopeQ());
            return openJB(null, { memo: `Adjustment to ${rec.title}${rec.sub ? ` — ${rec.sub}` : ""}`, ref: `ADJ-${rec.title.slice(-5)}` } as never);
          }
          case "submitJournal":
            return submitJ(arg);
          case "reviewJournal":
            return run("Reviewing journal", ["Check reviewer ≠ preparer", "Record review"], async () => {
              await finApi.journalAction(arg, "review");
              return "Reviewed. Ready to Post — posting is a separate step.";
            });
          case "approveJournal":
            return openApprove(arg);
          case "postJournal":
            return postJ(arg);
          case "voidJournal":
            return reasonModal("Void journal", "Unposted journals never touched the ledger. Voiding keeps it in history.", "Void", "d", async (r) => { await finApi.voidJournal(arg, r); return "Voided. It stays in history."; }, ["Check journal is unposted", "Void", "Audit logged"]);
          case "reverseJournal":
            return openReverse(arg);
          // accounts
          case "addAccount":
            return accountModal();
          case "editAccount":
            return accountModal(arg);
          case "deactivate":
            return reasonModal("Deactivate account", "No new postings will be allowed. All history is kept — accounts are never deleted. The balance must be zero.", "Deactivate", "d", async () => { await finApi.setActive(arg, false); return "Account deactivated."; }, ["Check balance is zero", "Check mappings & rules", "Deactivate"]);
          case "reactivate":
            return run("Reactivating account", ["Reactivate", "Audit logged"], async () => { await finApi.setActive(arg, true); return "Account reactivated."; });
          // banking
          case "addBank":
            return bankModal();
          case "connectFeed":
          case "importStatement":
            return importModal(arg || undefined);
          case "editBank": {
            const b = boot?.bankAccounts.find((x) => x.id === arg);
            return s.openModal({
              title: `Edit ${b?.name ?? "account"}`,
              fields: [{ k: "name", l: "Name", type: "text", req: true }, { k: "payout", l: "Payouts from", type: "sel", opts: [{ v: "", l: "None" }, { v: "stripe", l: "Stripe" }, { v: "square", l: "Square" }, { v: "paypal", l: "PayPal" }] }, { k: "active", l: "Status", type: "sel", opts: ["Active", "Inactive"] }],
              init: { name: b?.name ?? "", payout: "", active: b?.active === false ? "Inactive" : "Active" },
              buttons: [{ l: "Cancel", kind: "s", run: "close" }, { l: "Save", kind: "p", req: ["name"], run: (mf) => run("Saving bank account", ["Save", "Audit logged"], async () => { await finApi.editBank(arg, { name: mf.name, payoutProvider: mf.payout || null, active: mf.active === "Active" }); return "Saved."; }) }],
            });
          }
          case "reviewFeed": {
            const sc = await finApi.screen("feeds", { ...scopeQ() });
            const first = sc.table?.rows.find((r) => ["New", "Suggested", "Needs Review"].some((x) => r.seg.includes(x)));
            if (first) return openRec("feeds", first.id);
            return s.flash("All bank transactions are reviewed.");
          }
          case "matchFeed":
            return run("Matching bank line", ["Check amount & date", "Link bank line", "Audit logged"], async () => { await finApi.match(arg); return "Matched. Nothing was marked paid — payments are recorded where they happen."; });
          case "unmatchFeed":
            return run("Undoing", ["Check reconciliation lock", "Reverse categorization (if any)", "Return line to review"], async () => { await finApi.unmatch(arg); return "Match removed. The bank line is back in review."; });
          case "excludeFeed":
            return s.openModal({
              title: "Exclude transaction",
              intro: "Excluded lines are kept with the reason and can be restored.",
              fields: [{ k: "why", l: "Reason", type: "sel", opts: ["Duplicate import", "Personal / non-business", "Transfer already recorded", "Other"] }, { k: "note", l: "Note", type: "area", req: true, ph: "Explain for the audit trail" }],
              init: { why: "Duplicate import" },
              buttons: [{ l: "Cancel", kind: "s", run: "close" }, { l: "Exclude", kind: "d", req: ["note"], run: (mf) => run("Excluding", ["Record reason", "Exclude bank line", "Audit logged"], async () => { await finApi.exclude(arg, `${mf.why}: ${mf.note}`); return `Excluded — ${mf.why}.`; }) }],
            });
          case "chooseDiff":
            return chooseDiff(arg);
          case "split":
            return splitModal(arg);
          case "createRule": {
            const desc = arg ? (await finApi.record("feeds", arg, scopeQ())).title : undefined;
            return ruleModal(desc);
          }
          case "startRecon":
            return startReconModal(arg || undefined);
          case "reopenRecon":
            return reasonModal("Reopen reconciliation", "Reopening a locked reconciliation needs an Owner / Controller and a reason. Everything after is traced.", "Reopen", "p", async (r) => { await finApi.reopenRecon(arg, r); return "Reconciliation reopened."; }, ["Permission check", "Reopen", "Audit logged"]);
          // receivables
          case "adjustAR": {
            const rec = await finApi.record("ar", arg, scopeQ());
            const arAcct = boot?.accounts.find((x) => x.systemKey === "ar")?.id ?? "";
            const bad = boot?.accounts.find((x) => x.systemKey === "bad_debt")?.id ?? "";
            return openJB(null, { memo: `A/R adjustment — ${rec.sub} · ${rec.title}`, ref: "ARADJ", lines: [{ acct: bad, desc: `Adjustment ${rec.sub}`, dr: "", cr: "", dim: "" }, { acct: arAcct, desc: `${rec.title} · ${rec.sub}`, dr: "", cr: "", dim: "" }] } as never);
          }
          case "dispute":
            return reasonModal("Flag as disputed", "Disputed receivables are excluded from collections until resolved.", "Flag Dispute", "p", async (r) => { await finApi.dispute(arg, r); return "Flagged as disputed."; }, ["Record reason", "Exclude from collections"]);
          case "resolveDispute":
            return reasonModal("Resolve dispute", "Record how the dispute was settled.", "Resolve", "p", async (r) => { await finApi.resolveDispute(arg, r); return "Dispute resolved."; }, ["Record resolution", "Return to collections"], "Resolution");
          case "collections": {
            const rec = await finApi.record("ar", arg, scopeQ());
            return s.openModal({
              title: "Send payment reminder",
              intro: "Sends the customer the same payment reminder as Customer credit, on their preferred channel. No payment status changes here.",
              kv: [["Customer", rec.title], ["Sale", rec.sub], ["Balance", rec.amount], ["Aging", rec.kv.find((x) => x[0] === "Aging")?.[1] ?? ""]],
              fields: [{ k: "tone", l: "Tone", type: "sel", opts: [{ v: "gentle", l: "Friendly reminder" }, { v: "firm", l: "Firm reminder" }, { v: "final", l: "Final notice" }] }],
              init: { tone: "gentle" },
              buttons: [{ l: "Cancel", kind: "s", run: "close" }, { l: "Send Reminder", kind: "p", run: (mf) => run("Sending reminder", ["Check customer channel & opt-in", "Send message", "Audit logged"], async () => { const r = await finApi.collections(arg, mf.tone); return r.sent ? `Reminder sent to ${rec.title}.` : { msg: `Not sent — the customer has no reachable channel or opted out (${r.skipped} skipped).`, warn: true }; }) }],
            });
          }
          // bills
          case "addBill":
            return openBill("Manual");
          case "scanBill":
            return openBill("Photo Digitizer");
          case "importBill":
            return openBill("Upload");
          case "editBill":
            return openBill("Manual", arg);
          case "submitBill":
            return run("Submitting bill", ["Duplicate & match check", "Check threshold", "Create approval"], async () => { await finApi.billAction(arg, "submit"); return "Submitted for approval — it also appears in Action Center."; });
          case "approveBill":
            return run("Approving bill", ["Check approver ≠ creator", "Check threshold", "Record approval"], async () => { await finApi.billAction(arg, "approve", {}); return "Approved. Ready to post."; });
          case "rejectBill":
            return reasonModal("Reject bill", "The bill returns to the preparer with your reason.", "Reject", "d", async (r) => { await finApi.billAction(arg, "reject", { reason: r }); return "Bill rejected."; }, ["Record reason", "Return to preparer"]);
          case "postBill":
            return run("Posting bill", ["Validate balanced", "Validate open period", "Validate accounts & tax", "Commit all lines"], async () => { await finApi.billAction(arg, "post"); return "Bill posted to A/P."; });
          case "voidBill":
            return reasonModal("Void bill", "The bill is voided and kept in history; a posted bill is reversed.", "Void Bill", "d", async (r) => { await finApi.billAction(arg, "void", { reason: r }); return "Bill voided."; }, ["Record reason", "Reverse posting (if any)", "Audit logged"]);
          case "clearReview":
            return reasonModal("Not a duplicate", "Confirm you checked the flagged duplicate or match exception.", "Clear Flag", "p", async (r) => { await finApi.billAction(arg, "clear-review", { reason: r }); return "Flag cleared. Submit the bill for approval."; }, ["Record review", "Return to draft"], "What you checked");
          case "approvePay":
            return run("Approving for payment", ["Check posted balance", "Mark approved for payment"], async () => { await finApi.billAction(arg, "approve-payment"); return "Approved for payment. Record the payment once it’s made."; });
          case "hold":
            return reasonModal("Put on hold", "Held bills can’t be paid until the hold is released.", "Hold", "p", async (r) => { await finApi.billAction(arg, "hold", { on: true, reason: r }); return "Bill on hold."; }, ["Record reason", "Hold"]);
          case "releaseHold":
            return run("Releasing hold", ["Release hold", "Audit logged"], async () => { await finApi.billAction(arg, "hold", { on: false }); return "Hold released."; });
          case "payBill":
            return payModal(arg);
          // tax
          case "reviewTax": {
            const sc = await finApi.screen("taxes", scopeQ());
            const r = sc.table?.rows.find((x) => !x.seg.includes("Filed"));
            if (r) return openRec("taxes", r.id);
            return s.flash("No open tax returns.");
          }
          case "taxSubmit":
            return run("Submitting return", ["Recalculate from posted ledger", "Snapshot exceptions", "Create approval"], async () => { await finApi.taxAction(arg, "submit"); return "Return submitted for approval. Not filed."; });
          case "taxApprove":
            return run("Approving return", ["Check approver ≠ preparer", "Record approval", "Lock calculation"], async () => { await finApi.taxAction(arg, "approve"); return "Calculation locked. Export the filing pack, file with the authority, then record the confirmation."; });
          case "taxReopen":
            return reasonModal("Reopen return", "Unlocks the calculation so it can be recalculated.", "Reopen", "p", async (r) => { await finApi.taxAction(arg, "reopen", { reason: r }); return "Return reopened."; }, ["Permission check", "Unlock calculation"]);
          case "taxFiled":
            return s.openModal({
              title: "Record filing evidence",
              intro: "A return is marked Filed only with the confirmation reference from the authority or your filing provider. Attach the receipt from the return’s Evidence tab.",
              fields: [{ k: "ref", l: "Filing confirmation reference", type: "text", req: true, ph: "e.g. VAT-2026-Q3-448120" }, { k: "date", l: "Filed on", type: "date", req: true }],
              init: { date: todayIso() },
              buttons: [{ l: "Cancel", kind: "s", run: "close" }, { l: "Record as Filed", kind: "p", req: ["ref", "date"], run: (mf) => run("Recording filing", ["Record confirmation", "Update Reports › Tax filing history", "Audit logged"], async () => { await finApi.taxAction(arg, "filed", { filingRef: mf.ref, filedOn: mf.date }); return `Marked Filed with confirmation ${mf.ref}.`; }) }],
            });
          // assets
          case "capitalize":
            return capitalizeModal(arg || undefined);
          case "runDep":
            return runDepModal();
          case "dispose": {
            const rec = await finApi.record("fa", arg, scopeQ());
            const nbv = num((rec.kv.find((k) => k[0] === "Net book value")?.[1] ?? "0").replace("−", "-"));
            return s.openModal({
              title: `Dispose (accounting) — ${rec.title}`,
              intro: "Derecognizes the asset: removes its cost and accumulated depreciation and books the gain or loss.",
              kv: rec.kv.filter((k) => ["Cost", "Accumulated depreciation", "Net book value"].includes(k[0])),
              fields: [{ k: "date", l: "Disposal date", type: "date", req: true }, { k: "p", l: "Sale proceeds", type: "number", ph: "0.00" }, { k: "acct", l: "Proceeds received into", type: "sel", opts: acctOptions(boot, (x) => x.type === "asset") }, { k: "reason", l: "Reason", type: "area", req: true }],
              init: { date: todayIso(), p: "0", acct: boot?.bankAccounts[0]?.glAccountId ?? "" },
              live: (mf) => {
                const g = r2(num(mf.p) - nbv);
                return { t: `${g >= 0 ? "Gain" : "Loss"} on disposal ${money(Math.abs(g), boot?.base)}`, ok: g >= 0 };
              },
              buttons: [{ l: "Cancel", kind: "s", run: "close" }, { l: "Dispose", kind: "p", req: ["date", "reason"], run: (mf) => run("Disposing asset", ["Calculate gain/loss", "Post disposal journal", "Update register"], async () => { const r = await finApi.dispose(arg, { date: mf.date, proceeds: num(mf.p), proceedsAccountId: num(mf.p) ? mf.acct : null, reason: mf.reason }); return `${r.journal.number} posted · ${r.gain >= 0 ? "gain" : "loss"} ${money(Math.abs(r.gain), boot?.base)}.`; }) }],
            });
          }
          // budgets
          case "createBudget":
            return budgetModal();
          case "importBudget":
            return importBudgetModal();
          case "explain": {
            const [bid, accountId] = arg.split("|");
            return reasonModal("Explain variance", "Saved on the budget lines for this account and period.", "Save Explanation", "p", async (r) => { await finApi.budgetAction(bid, "explain", { accountId, period: s.period || todayIso().slice(0, 7), text: r }); return "Explanation saved."; }, ["Save explanation"], "Explanation");
          }
          case "editBudget": {
            const b = await finApi.budget(arg);
            const accts = acctOptions(boot, (x) => ["revenue", "cos", "expense", "other_inc", "other_exp"].includes(x.type));
            const monthName = (m: { year: number; month: number }) => new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
            const valuesFor = (accountId: string) => Object.fromEntries(b.months.map((m, i) => [`m${i}`, String(Number(b.lines.find((l) => l.accountId === accountId && l.year === m.year && l.month === m.month && !l.department)?.amount ?? "") || "")]));
            const first = accts[0]?.v ?? "";
            return s.openModal({
              title: `Edit ${b.name} v${b.version}`,
              intro: "Enter the monthly budget for one account at a time. Leave a month blank for no budget. Choosing another account loads its months.",
              wide: true,
              fields: [{ k: "acct", l: "Account", type: "sel", opts: accts }, ...b.months.map((m, i) => ({ k: `m${i}`, l: monthName(m), type: "number" as const, ph: "0" }))],
              init: { acct: first, ...valuesFor(first) },
              live: (mf) => {
                const total = b.months.reduce((t, _m, i) => t + num(mf[`m${i}`]), 0);
                return { t: `Year total for this account: ${money(total, boot?.base)}`, ok: true };
              },
              buttons: [
                { l: "Close", kind: "s", run: "close" },
                { l: "Load Account", kind: "s", run: (mf) => { st.setState({ mf: { ...mf, ...valuesFor(mf.acct) } }); } },
                {
                  l: "Save Account",
                  kind: "p",
                  req: ["acct"],
                  run: async (mf) => {
                    st.setState({ mBusy: true });
                    try {
                      for (let i = 0; i < b.months.length; i++) await finApi.budgetLine(arg, { accountId: mf.acct, year: b.months[i].year, month: b.months[i].month, amount: num(mf[`m${i}`]) });
                      const fresh = await finApi.budget(arg);
                      b.lines = fresh.lines;
                      st.setState({ mBusy: false, mErr: "" });
                      st.getState().flash(`Saved ${accts.find((a) => a.v === mf.acct)?.l ?? "account"}. Pick another account or close.`);
                      await invalidate();
                    } catch (e) {
                      st.setState({ mBusy: false, mErr: errText(e) });
                    }
                  },
                },
              ],
            });
          }
          case "reviseBudget":
            return run("Creating revision", ["Copy approved lines", "Save as Draft"], async () => { const b = await finApi.budgetAction(arg, "revise"); st.setState({ bver: b.id ?? "" }); return `Revision v${b.version} created as Draft.`; });
          case "submitBudget":
            return run("Submitting budget", ["Validate lines", "Create approval"], async () => { await finApi.budgetAction(arg, "submit"); return "Submitted for Owner / Controller approval."; });
          case "approveBudget":
            return run("Approving budget", ["Record approval", "Lock the version it replaces"], async () => { await finApi.budgetAction(arg, "approve"); return "Approved — now the active budget."; });
          case "rejectBudget":
            return reasonModal("Reject budget", "The budget returns to Draft with your reason.", "Reject", "d", async (r) => { await finApi.budgetAction(arg, "reject", { reason: r }); return "Returned to Draft."; }, ["Record reason", "Return to Draft"]);
          // close
          case "startClose":
            return closeStartModal();
          case "closeDone":
            return closeDoneModal(arg);
          case "closeReopenTask":
            return run("Reopening control", ["Reopen control"], async () => { await finApi.taskAction(arg, "reopen"); return "Control reopened."; });
          case "finalApprove":
            return run("Final approval", ["Check approver ≠ preparer", "All controls complete", "Lock period", "Audit logged"], async () => { await finApi.finalApprove(arg); return "Period approved and locked. Postings now need a reopen."; });
          case "reopenPeriod":
            return reopenPeriodModal(arg);
          // settings
          case "invite":
            return inviteModal();
          case "revoke":
            return reasonModal("Revoke access", "Their Finance sign-in stops working immediately.", "Revoke", "d", async () => { await finApi.revoke(arg); return "Access revoked."; }, ["Deactivate sign-in", "Audit logged"], "Reason");
          case "addRate":
            return rateModal();
          default:
            return s.flash(a);
        }
      } catch (e) {
        s.flash(errText(e));
      }
    },
    [st, screen, go, openRec, router, run, invalidate, scopeQ, attachModal, openJB, submitJ, openApprove, postJ, reasonModal, openReverse, accountModal, bankModal, importModal, boot, chooseDiff, splitModal, ruleModal, startReconModal, openBill, payModal, capitalizeModal, runDepModal, budgetModal, importBudgetModal, closeStartModal, closeDoneModal, reopenPeriodModal, inviteModal, rateModal],
  );

  return useMemo(() => ({ act, run, invalidate, go, openRec, scopeQ }), [act, run, invalidate, go, openRec, scopeQ]);
}

/** Journal fields for the builder (the drawer shows formatted values; editing needs raw ones). */
async function fetchJournalForEdit(id: string) {
  const { apiFetch } = await import("@/lib/api-client");
  return apiFetch<{ number: string; version: number; date: string; reference: string | null; memo: string | null; type: string; branchId: string | null; currency: string; lines: { accountId: string | null; description: string | null; txnDebit: string; txnCredit: string; department: string | null }[] }>(`/finance/journals/${id}`);
}

export type FinAct = ReturnType<typeof useFinActions>;
export type { ModalSpec };
