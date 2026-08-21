import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as net from 'net';
import { QueueModule } from './queue.module';
import { DEMO_QUEUE, dlqName } from './queue.constants';
import { QueueService } from './queue.service';

/** Probes Redis so this suite skips cleanly on machines without Redis running, instead of failing. */
function isRedisReachable(
  host: string,
  port: number,
  timeoutMs = 500,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host);
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

describe('QueueModule DLQ (BE-010)', () => {
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable(
      process.env.REDIS_HOST ?? 'localhost',
      Number(process.env.REDIS_PORT ?? 6379),
    );
  });

  it('lands a job on the DLQ after exhausting all 5 retry attempts', async () => {
    if (!redisAvailable) {
      console.warn(
        'Skipping BE-010 DLQ test: Redis is not reachable in this environment.',
      );
      return;
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        QueueModule.forRoot(),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const queueService = moduleRef.get(QueueService);
    const dlq = moduleRef.get<Queue>(getQueueToken(dlqName(DEMO_QUEUE)));

    const jobId = `dlq-test-${Date.now()}`;
    try {
      // Production backoff is 2s exponential × 5 attempts (~30s). Keep all 5 attempts
      // but use a short fixed delay so this spec proves DLQ routing, not the clock.
      await queueService.addDemoJob(
        'forced-failure',
        { shouldFail: true },
        jobId,
        { backoff: { type: 'fixed', delay: 50 } },
      );

      const landed = await new Promise<boolean>((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
          void dlq.getJob(jobId).then((job) => {
            if (job) {
              clearInterval(interval);
              resolve(true);
            } else if (Date.now() - start > 10_000) {
              clearInterval(interval);
              resolve(false);
            }
          });
        }, 100);
      });

      expect(landed).toBe(true);
    } finally {
      await app.close();
    }
  }, 30_000);
});
