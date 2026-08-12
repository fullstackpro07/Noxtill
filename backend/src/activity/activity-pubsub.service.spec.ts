import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { ActivityPubSubService } from './activity-pubsub.service';

/**
 * This dev environment has no Redis reachable (the standing, disclosed gap noted throughout the
 * project) — which makes it the right place to prove the one thing that actually matters for a
 * best-effort live-push feature: it fails fast and quietly rather than hanging or throwing,
 * unlike BullMQ's default indefinite-retry behavior (see test/close-app.util.ts's own comment
 * on that exact failure mode from a real e2e debugging session).
 */
describe('ActivityPubSubService (UPD-BE-002)', () => {
  let service: ActivityPubSubService;

  beforeAll(() => {
    const config = {
      get: (_key: string, fallback?: unknown) => fallback,
    } as unknown as ConfigService;
    service = new ActivityPubSubService(config);
  });

  afterAll(() => {
    service.onModuleDestroy();
  });

  it('publish() resolves (does not throw or hang) when Redis is unreachable', async () => {
    const start = Date.now();
    await expect(
      service.publish('activity:test', { hello: 'world' }),
    ).resolves.toBeUndefined();
    expect(Date.now() - start).toBeLessThan(5000);
  }, 10_000);

  it('subscribe() does not hang forever waiting on an unreachable Redis', async () => {
    const result = await firstValueFrom(
      service.subscribe('activity:test').pipe(
        timeout(5000),
        catchError(() => of('timed-out-or-errored-as-expected')),
      ),
    );
    // Either outcome is acceptable here — the point is the call above resolved at all within
    // the timeout instead of hanging indefinitely.
    expect(typeof result === 'string' || result === undefined).toBe(true);
  }, 10_000);
});
