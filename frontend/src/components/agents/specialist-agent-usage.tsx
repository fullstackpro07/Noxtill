import type { SpecialistAgentAiUsageCall } from '@/lib/specialist-agent-usage';

export function SpecialistAgentUsage({
  calls,
}: {
  calls?: SpecialistAgentAiUsageCall[];
}) {
  if (!calls) return null;

  if (calls.length === 0) {
    return (
      <p className="mb-0 text-[10.5px]" style={{ color: 'var(--app-text-faint)' }}>
        No AI provider usage was recorded for this run.
      </p>
    );
  }

  const inputTokens = calls.reduce((sum, call) => sum + call.inputTokens, 0);
  const outputTokens = calls.reduce((sum, call) => sum + call.outputTokens, 0);
  const estimatedCostUsd = calls.reduce((sum, call) => {
    const cost = Number(call.estimatedCostUsd);
    return Number.isFinite(cost) ? sum + cost : sum;
  }, 0);

  return (
    <p className="mb-0 text-[10.5px]" style={{ color: 'var(--app-text-faint)' }}>
      AI usage · {calls.length} provider call{calls.length === 1 ? '' : 's'} ·{' '}
      {(inputTokens + outputTokens).toLocaleString()} tokens · estimated{' '}
      ${estimatedCostUsd.toFixed(4)} USD (app usage-log estimate)
    </p>
  );
}
