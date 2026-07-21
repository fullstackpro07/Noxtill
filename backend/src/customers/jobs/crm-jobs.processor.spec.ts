import { PrismaService } from '../../prisma/prisma.service';
import { LocaleService } from '../../common/localization/locale.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { CrmJobsProcessor } from './crm-jobs.processor';
import { VIP_LIFETIME_SPEND_THRESHOLD } from './crm-jobs.constants';

describe('CrmJobsProcessor (BE-041)', () => {
  let prisma: PrismaService;
  let processor: CrmJobsProcessor;
  let businessId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  // UTC business, so "local hour" == UTC hour — makes the fixed `now` below deterministic.
  const midnightUtc = new Date('2026-03-01T00:00:00Z');
  const nineAmUtc = new Date('2026-03-01T09:00:00Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new CrmJobsProcessor(
      prisma,
      new LocaleService(),
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'CRM Jobs Test Biz',
        slug: `crm-jobs-test-${Date.now()}`,
        timezone: 'UTC',
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('tags a high-spend customer VIP and an inactive one Lapsed, only at the business local midnight', async () => {
    const vip = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}1`,
        name: 'Big Spender',
        lifetimeSpend: VIP_LIFETIME_SPEND_THRESHOLD + 1,
      },
    });
    const lapsed = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}2`,
        name: 'Ghost',
        lastVisitAt: new Date('2025-01-01'),
      },
    });

    await processor.runTagRules(nineAmUtc); // wrong hour — should be a no-op
    let refreshedVip = await prisma.customer.findUniqueOrThrow({
      where: { id: vip.id },
    });
    expect(refreshedVip.tags).not.toContain('VIP');

    await processor.runTagRules(midnightUtc); // matches TAG_RULES_LOCAL_HOUR
    refreshedVip = await prisma.customer.findUniqueOrThrow({
      where: { id: vip.id },
    });
    const refreshedLapsed = await prisma.customer.findUniqueOrThrow({
      where: { id: lapsed.id },
    });

    expect(refreshedVip.tags).toContain('VIP');
    expect(refreshedLapsed.tags).toContain('Lapsed');
  });

  it('sends a birthday greeting only to customers whose birthday is today, only at the configured local hour', async () => {
    const birthdayToday = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}3`,
        name: 'Birthday Person',
        birthday: new Date('1990-03-01'),
      },
    });
    await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}4`,
        name: 'Not Today',
        birthday: new Date('1990-06-15'),
      },
    });
    await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}5`,
        name: 'Opted Out Birthday',
        birthday: new Date('1990-03-01'),
        optedOut: true,
      },
    });

    await processor.runBirthdayGreetings(midnightUtc); // wrong hour for birthdays
    expect(sendGate.send).not.toHaveBeenCalled();

    await processor.runBirthdayGreetings(nineAmUtc); // matches BIRTHDAY_LOCAL_HOUR
    expect(sendGate.send).toHaveBeenCalledTimes(1);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: birthdayToday.id }),
    );
  });
});
