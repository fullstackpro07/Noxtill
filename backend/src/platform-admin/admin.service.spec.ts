import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService (BE-072)', () => {
  let prisma: PrismaService;
  let service: AdminService;
  const eventIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new AdminService(prisma);

    const started = await prisma.event.create({
      data: { name: 'signup_started' },
    });
    const completed = await prisma.event.create({
      data: { name: 'signup_completed' },
    });
    eventIds.push(started.id, completed.id);
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.$disconnect();
  });

  it('reports activation funnel counts including our freshly recorded events', async () => {
    const funnel = await service.activationFunnel(1);
    const startedRow = funnel.find((f) => f.name === 'signup_started')!;
    const completedRow = funnel.find((f) => f.name === 'signup_completed')!;

    expect(startedRow.count).toBeGreaterThanOrEqual(1);
    expect(completedRow.count).toBeGreaterThanOrEqual(1);
  });

  it('lists recent events filtered by name', async () => {
    const events = await service.events('signup_started', 10);
    expect(events.some((e) => e.id === eventIds[0])).toBe(true);
  });

  it('summarizes total businesses by plan', async () => {
    const summary = await service.businessesSummary();
    expect(summary.total).toBeGreaterThan(0);
    expect(Array.isArray(summary.byPlan)).toBe(true);
  });
});
