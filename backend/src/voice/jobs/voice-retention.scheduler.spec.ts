import { Queue } from 'bullmq';
import { VoiceRetentionScheduler } from './voice-retention.scheduler';

describe('VoiceRetentionScheduler', () => {
  it('registers orphaned-call reconciliation every five minutes', () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new VoiceRetentionScheduler(queue as unknown as Queue);

    scheduler.onModuleInit();

    expect(queue.add).toHaveBeenCalledWith(
      'reconcile-orphaned-calls',
      {},
      {
        repeat: { pattern: '*/5 * * * *' },
        jobId: 'voice-orphaned-call-reconciliation-every-5-minutes',
      },
    );
  });
});
