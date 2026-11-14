export const SPECIALIST_AGENT_ORCHESTRATION_QUEUE =
  'specialist-agent-orchestration';

export const SPECIALIST_AGENT_ORCHESTRATION_JOB_ATTEMPTS = 5;
export const SPECIALIST_AGENT_ORCHESTRATION_BACKOFF_MS = 2_000;

/** A minute-level scan repairs the small DB-write/Redis-enqueue crash window. */
export const SPECIALIST_AGENT_ORCHESTRATION_RECOVERY_PATTERN = '*/1 * * * *';

/** Transient evidence cleanup is a separate daily tick on the same worker queue. */
export const SPECIALIST_AGENT_RETENTION_PATTERN = '0 3 * * *';

/** Pending specialist approvals expire on a short recurring worker tick. */
export const SPECIALIST_AGENT_ACTION_EXPIRY_PATTERN = '*/15 * * * *';
