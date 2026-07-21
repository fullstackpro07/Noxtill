import { PrismaService } from '../../prisma/prisma.service';
import { WebhookIdempotencyService } from './webhook-idempotency.service';

describe('WebhookIdempotencyService (BE-011)', () => {
  let prisma: PrismaService;
  let service: WebhookIdempotencyService;
  const provider = 'test-provider';
  const eventId = `evt-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new WebhookIdempotencyService(prisma);
  });

  afterAll(async () => {
    await prisma.webhookEvent.deleteMany({ where: { provider } });
    await prisma.$disconnect();
  });

  it('claims a new event the first time', async () => {
    const isNew = await service.claim(provider, eventId);
    expect(isNew).toBe(true);
  });

  it('rejects the same event on replay', async () => {
    const isNew = await service.claim(provider, eventId);
    expect(isNew).toBe(false);
  });

  it('only enqueues once for duplicate deliveries via handle()', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const replayEventId = `${eventId}-handle`;

    const first = await service.handle(provider, replayEventId, enqueue);
    const second = await service.handle(provider, replayEventId, enqueue);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
