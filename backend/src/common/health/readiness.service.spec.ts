import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  const config = (values: Record<string, string | undefined>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  it('is ready against the real database when Redis is not configured', async () => {
    const prisma = new PrismaService();
    await prisma.$connect();
    const service = new ReadinessService(prisma, config({}));
    await expect(service.check()).resolves.toMatchObject({
      status: 'ready',
      checks: { database: 'ok', redis: 'not_configured' },
    });
    await prisma.$disconnect();
  });

  it('is not ready when the database does not answer', async () => {
    const prisma = {
      $queryRaw: () => Promise.reject(new Error('down')),
    } as unknown as PrismaService;
    const service = new ReadinessService(prisma, config({}));
    await expect(service.check()).resolves.toMatchObject({
      status: 'not_ready',
      checks: { database: 'failed' },
    });
  });

  it('is not ready when configured Redis cannot be reached', async () => {
    const prisma = {
      $queryRaw: () => Promise.resolve([{ 1: 1 }]),
    } as unknown as PrismaService;
    const service = new ReadinessService(
      prisma,
      config({ REDIS_HOST: '127.0.0.1', REDIS_PORT: '1' }),
    );
    const result = await service.check();
    await service.onModuleDestroy();
    expect(result).toMatchObject({
      status: 'not_ready',
      checks: { database: 'ok', redis: 'failed' },
    });
  });
});
