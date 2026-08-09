import { INestApplication } from '@nestjs/common';

/**
 * `app.close()` waits on every real BullMQ Queue/Worker's ioredis client to quit, which
 * never resolves when Redis is unreachable (this dev environment has no local Redis —
 * the same disclosed gap noted throughout this project's INT tickets). Racing against a
 * grace period lets the suite finish instead of hanging; any leftover reconnect timers are
 * swept up by Jest's `forceExit` (test/jest-e2e.json). In CI, where Redis is a real service
 * container, `app.close()` itself resolves well inside the grace period.
 */
export async function closeApp(app: INestApplication, graceMs = 3_000): Promise<void> {
  await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, graceMs))]);
}
