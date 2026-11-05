"use client";

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { formatCurrency } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useSession } from '@/lib/session';
import {
  approveFinanceBudget,
  fetchFinanceBudgets,
  rejectFinanceBudget,
  saveFinanceBudgetDraft,
  submitFinanceBudget,
  type FinanceBudgetLine,
} from '@/lib/finance-budgets-api';

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function amountText(value: string | null, currency: string) {
  return value === null ? 'Not tracked' : formatCurrency(Number(value), currency);
}

export function FinanceBudgetsPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const canManage = session.user.role === 'owner' || session.user.role === 'manager';
  const [month, setMonth] = useState(currentMonth);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [decisionTarget, setDecisionTarget] = useState<{ id: string; decision: 'approve' | 'reject' } | null>(null);
  const [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: ['finance-budgets', session.business.id, month],
    queryFn: () => fetchFinanceBudgets(month),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance-budgets', session.business.id, month] });
  const save = useMutation({
    mutationFn: saveFinanceBudgetDraft,
    onSuccess: () => {
      setCategory('');
      setAmount('');
      setNote('');
      void refresh();
      toast.success('Budget draft saved. Submit it for review when it is ready.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save the budget draft.'),
  });
  const submit = useMutation({
    mutationFn: submitFinanceBudget,
    onSuccess: () => { void refresh(); toast.success('Budget submitted for approval.'); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not submit the budget.'),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision, reason: decisionReason }: { id: string; decision: 'approve' | 'reject'; reason: string }) =>
      decision === 'approve'
        ? approveFinanceBudget(id, decisionReason)
        : rejectFinanceBudget(id, decisionReason),
    onSuccess: () => {
      setDecisionTarget(null);
      setReason('');
      void refresh();
      toast.success('Budget review recorded.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not record the budget decision.'),
  });

  const data = query.data;
  const fieldStyle: React.CSSProperties = {
    minHeight: 40,
    border: '1px solid var(--app-border)',
    borderRadius: 9,
    padding: '8px 10px',
    background: 'var(--app-surface)',
    color: 'var(--app-text)',
    fontSize: 12,
  };
  const buttonStyle: React.CSSProperties = {
    minHeight: 36,
    border: '1px solid var(--app-border)',
    borderRadius: 9,
    padding: '7px 11px',
    background: 'var(--app-surface)',
    color: 'var(--app-text-muted)',
    fontSize: 11,
    fontWeight: 700,
  };

  function reviewAction(line: FinanceBudgetLine, decision: 'approve' | 'reject') {
    if (!line.latestRevision) return;
    setDecisionTarget({ id: line.latestRevision.id, decision });
    setReason('');
  }

  return (
    <section id="finance-budgets" className="rounded-[16px]" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', padding: 17 }} aria-label="Finance budgets and actual expenses">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[14.5px] font-extrabold" style={{ color: 'var(--app-text)' }}>Budget vs actual expenses</h2>
          <p className="mb-0 mt-1 text-[11.5px] leading-relaxed" style={{ color: 'var(--app-text-faint)' }}>
            Approved budgets are compared with real expense entries for the selected month. This is business-wide because expenses do not store a branch. It is not a general ledger or a reconciled accounting statement.
          </p>
        </div>
        <input type="month" aria-label="Budget month" value={month} onChange={(event) => setMonth(event.target.value)} style={fieldStyle} />
      </div>

      {canManage && (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[minmax(130px,1fr)_150px_minmax(150px,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({ month, category, amount, note: note || undefined });
          }}
        >
          <input aria-label="Expense budget category" value={category} onChange={(event) => setCategory(event.target.value)} maxLength={191} placeholder="Expense category" required style={fieldStyle} />
          <input aria-label="Monthly budget amount" value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="0.01" placeholder={`Amount (${data?.currencyCode ?? session.business.currency})`} required style={fieldStyle} />
          <input aria-label="Budget note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Reason or context (optional)" style={fieldStyle} />
          <button type="submit" disabled={save.isPending} className="rounded-[9px] px-3 text-[11px] font-bold text-white disabled:opacity-50" style={{ background: 'var(--app-primary)', minHeight: 40 }}>
            {save.isPending ? 'Saving…' : 'Save draft'}
          </button>
        </form>
      )}
      {canManage && <p className="mb-0 mt-1.5 text-[10px]" style={{ color: 'var(--app-text-disabled)' }}>Saving the same category updates its open draft. Submit creates an approval request; changes after approval need a new revision.</p>}

      {query.isPending ? (
        <p className="mb-0 mt-3 text-[11.5px]" style={{ color: 'var(--app-text-disabled)' }}>Loading budget actuals…</p>
      ) : query.isError ? (
        <p role="alert" className="mb-0 mt-3 text-[11.5px]" style={{ color: 'var(--app-text-muted)' }}>{query.error instanceof ApiError ? query.error.message : 'Budget actuals could not be loaded.'}</p>
      ) : data?.lines.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[11px]">
            <thead style={{ color: 'var(--app-text-faint)' }}>
              <tr>
                <th className="pb-2 pr-3 font-semibold">Category</th>
                <th className="pb-2 pr-3 font-semibold">Approved budget</th>
                <th className="pb-2 pr-3 font-semibold">Recorded expenses</th>
                <th className="pb-2 pr-3 font-semibold">Variance</th>
                <th className="pb-2 pr-3 font-semibold">Latest revision</th>
                <th className="pb-2 font-semibold">Review</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => {
                const latest = line.latestRevision;
                const varianceValue = line.variance === null ? null : Number(line.variance);
                const editingDecision = Boolean(latest && decisionTarget?.id === latest.id);
                return (
                  <tr key={line.category} className="border-t align-top" style={{ borderColor: 'var(--app-border)' }}>
                    <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--app-text)' }}>{line.category || 'Recorded with a blank category'}</td>
                    <td className="py-2.5 pr-3" style={{ color: 'var(--app-text-muted)' }}>{line.approvedBudget ? amountText(line.approvedBudget.amount, data.currencyCode) : 'Not budgeted'}</td>
                    <td className="py-2.5 pr-3" style={{ color: 'var(--app-text-muted)' }}>{amountText(line.actualAmount, data.currencyCode)}</td>
                    <td className="py-2.5 pr-3" style={{ color: varianceValue !== null && varianceValue > 0 ? '#B54708' : 'var(--app-text-muted)' }}>
                      {varianceValue === null ? 'Not available' : `${varianceValue > 0 ? 'Over' : 'Under / at'} ${amountText(String(Math.abs(varianceValue)), data.currencyCode)}`}
                    </td>
                    <td className="py-2.5 pr-3" style={{ color: 'var(--app-text-muted)' }}>
                      {latest ? <><span className="font-semibold capitalize">{latest.status.replaceAll('_', ' ')}</span><span className="block text-[10px]" style={{ color: 'var(--app-text-disabled)' }}>v{latest.version} · {amountText(latest.amount, data.currencyCode)}</span>{latest.reviewReason && <span className="block max-w-[220px] text-[10px]" style={{ color: 'var(--app-text-faint)' }}>{latest.reviewReason}</span>}</> : 'No budget revision'}
                    </td>
                    <td className="py-2.5">
                      {latest?.status === 'draft' && canManage && <button type="button" onClick={() => submit.mutate(latest.id)} disabled={submit.isPending} style={buttonStyle}>Submit</button>}
                      {latest?.status === 'pending_approval' && canManage && !editingDecision && (
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => reviewAction(line, 'approve')} style={buttonStyle}>Approve</button>
                          <button type="button" onClick={() => reviewAction(line, 'reject')} style={buttonStyle}>Reject</button>
                        </div>
                      )}
                      {editingDecision && decisionTarget && (
                        <div className="min-w-[220px]">
                          <div className="mb-1 text-[10px] font-semibold capitalize" style={{ color: 'var(--app-text-muted)' }}>{decisionTarget.decision} reason</div>
                          <textarea aria-label={`${decisionTarget.decision} reason for ${line.category}`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500} rows={2} style={{ ...fieldStyle, width: '100%', height: 'auto' }} />
                          <div className="mt-1 flex gap-1.5">
                            <button type="button" onClick={() => decide.mutate({ id: decisionTarget.id, decision: decisionTarget.decision, reason })} disabled={reason.trim().length < 8 || decide.isPending} style={buttonStyle}>{decide.isPending ? 'Saving…' : 'Record decision'}</button>
                            <button type="button" onClick={() => setDecisionTarget(null)} style={buttonStyle}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mb-0 mt-2 text-[10px]" style={{ color: 'var(--app-text-disabled)' }}>Actuals source: Expense records by incurred date and stored category · {new Date(data.asOf).toLocaleString()}</p>
        </div>
      ) : (
        <p className="mb-0 mt-3 text-[11.5px]" style={{ color: 'var(--app-text-disabled)' }}>No budget or expense-category records exist for this month.</p>
      )}
    </section>
  );
}
