export type SpecialistAgentTriggerType = 'manual' | 'scheduled' | 'event';

export type SpecialistAgentTriggerRef = {
  eventId: string;
  sourceModule: string;
  entityType: string;
  entityId: string;
  /** ISO-8601 timestamp from the canonical source record/event, not worker time. */
  occurredAt: string;
  /** Source version token; null only when the canonical source has no version field. */
  entityVersion: string | null;
  /** Version of this persisted event-envelope contract. */
  schemaVersion: 1;
  /** Stable correlation key; eventId is used when the source has no parent trace ID. */
  correlationId: string;
};

export function createSpecialistAgentTriggerRef(input: {
  eventId: string;
  sourceModule: string;
  entityType: string;
  entityId: string;
  occurredAt: Date | string;
  entityVersion?: string | number | null;
  correlationId?: string;
}): SpecialistAgentTriggerRef {
  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt
      : new Date(input.occurredAt);
  if (
    !Number.isFinite(occurredAt.getTime()) ||
    !input.eventId.trim() ||
    !input.sourceModule.trim() ||
    !input.entityType.trim() ||
    !input.entityId.trim()
  ) {
    throw new Error('Invalid specialist-agent source event reference');
  }

  return {
    eventId: input.eventId,
    sourceModule: input.sourceModule,
    entityType: input.entityType,
    entityId: input.entityId,
    occurredAt: occurredAt.toISOString(),
    entityVersion:
      input.entityVersion === null || input.entityVersion === undefined
        ? null
        : String(input.entityVersion),
    schemaVersion: 1,
    correlationId: input.correlationId?.trim() || input.eventId,
  };
}

/** Additional execution context for existing canonical specialist-run services. */
export type SpecialistAgentRunOptions = {
  triggerType?: SpecialistAgentTriggerType;
  /** Scheduled reviews stay deterministic and do not initiate paid model requests. */
  includeAiSummary?: boolean;
  /** Canonical source event associated with an event-triggered review. */
  triggerRef?: SpecialistAgentTriggerRef;
  /** Parent orchestration run; stored as a minimal trace reference, never copied source data. */
  parentRunId?: string;
};

export function createSpecialistAgentParentRunRef(
  parentRunId: string,
  correlationId = parentRunId,
) {
  return {
    source: 'specialist_agent_orchestrator',
    parentRunId,
    correlationId,
    schemaVersion: 1,
  } as const;
}
