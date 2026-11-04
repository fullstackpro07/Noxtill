export { specialistAgentIdempotencyHash } from './specialist-agent-run-idempotency.util';

export function specialistAgentUtcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function specialistAgentDailyIdempotencyKey(
  agentKey: string,
  businessId: string,
  date: string,
): string {
  return `specialist-daily:${agentKey}:${businessId}:${date}`;
}
