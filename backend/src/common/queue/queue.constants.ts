export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: false, // keep failed jobs around until moved to their DLQ
};

/** Suffix applied to a queue's name to get its dead-letter queue name. */
export const dlqName = (queueName: string) => `${queueName}-dlq`;

export const DEMO_QUEUE = 'demo';

/** Reference payload for the demo queue (BE-010 DLQ proof). */
export interface DemoJobData {
  shouldFail?: boolean;
}

export interface DeadLetterJobData {
  originalJobId: string;
  data: DemoJobData;
  failedReason?: string;
}
