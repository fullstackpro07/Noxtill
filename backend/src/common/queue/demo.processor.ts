import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DemoJobData, DEMO_QUEUE } from './queue.constants';

/**
 * Reference processor proving the retry/backoff/DLQ wiring works end to end.
 * Jobs whose payload sets `shouldFail: true` always throw, so BE-010's
 * acceptance test can force a job through all 5 attempts and observe it land
 * on the DLQ.
 */
@Processor(DEMO_QUEUE)
export class DemoProcessor extends WorkerHost {
  process(job: Job<DemoJobData>): Promise<unknown> {
    if (job.data.shouldFail) {
      return Promise.reject(new Error('Forced failure for DLQ test'));
    }
    return Promise.resolve({ ok: true });
  }
}
