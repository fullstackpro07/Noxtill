import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

describe('EventsService (BE-072)', () => {
  let prisma: PrismaService;
  let service: EventsService;
  const eventIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new EventsService(prisma);
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.$disconnect();
  });

  it('records an event with no business yet (pre-signup instrumentation)', async () => {
    const event = await service.record({
      name: 'signup_started',
      properties: { source: 'landing' },
    });
    eventIds.push(event.id);

    expect(event.businessId).toBeNull();
    expect(event.properties).toEqual({ source: 'landing' });
  });

  it('records an event tied to a business and user', async () => {
    const event = await service.record({
      name: 'first_sale_recorded',
      businessId: 'biz-123',
      userId: 'user-456',
    });
    eventIds.push(event.id);

    expect(event.businessId).toBe('biz-123');
    expect(event.userId).toBe('user-456');
    expect(event.properties).toEqual({});
  });
});
