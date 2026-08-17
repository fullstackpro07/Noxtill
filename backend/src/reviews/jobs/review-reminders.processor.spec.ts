import { PrismaService } from '../../prisma/prisma.service';
import { LocaleService } from '../../common/localization/locale.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { ReviewRemindersProcessor } from './review-reminders.processor';
import { generateReviewToken } from '../review-token.util';
import { deleteCrossTestBusinessRows } from '../../common/testing/cleanup-test-business';

describe('ReviewRemindersProcessor (BE-045)', () => {
  let prisma: PrismaService;
  let processor: ReviewRemindersProcessor;
  let businessId: string;
  let customerId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  // UTC business, so "local hour" == UTC hour.
  const wrongHour = new Date('2026-03-10T00:00:00Z');
  const rightHour = new Date('2026-03-10T10:00:00Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new ReviewRemindersProcessor(
      prisma,
      new LocaleService(),
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Review Reminders Test Biz',
        slug: `review-reminders-test-${Date.now()}`,
        timezone: 'UTC',
      },
    });
    businessId = business.id;

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Bob' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.reviewRequest.deleteMany({ where: { businessId } });
      await prisma.customer.deleteMany({ where: { businessId } });
      await deleteCrossTestBusinessRows(prisma, businessId);
      await prisma.business.delete({ where: { id: businessId } });
    }
    await prisma?.$disconnect();
  });

  it('sends the day-3 reminder once 3+ days old, never at the wrong hour, and stops at 2 reminders', async () => {
    const threeDaysAgo = new Date(
      rightHour.getTime() - 3 * 24 * 60 * 60 * 1000,
    );
    const request = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
        createdAt: threeDaysAgo,
      },
    });

    await processor.runReminders(wrongHour); // wrong hour — no-op
    expect(sendGate.send).not.toHaveBeenCalled();

    await processor.runReminders(rightHour); // day-3 reminder fires
    expect(sendGate.send).toHaveBeenCalledTimes(1);
    let refreshed = await prisma.reviewRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(refreshed.reminderCount).toBe(1);

    sendGate.send.mockClear();
    await processor.runReminders(rightHour); // not yet day 7 — no-op
    expect(sendGate.send).not.toHaveBeenCalled();

    // Fast-forward the request's createdAt to simulate day 7 having arrived.
    const sevenDaysAgo = new Date(
      rightHour.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    await prisma.reviewRequest.update({
      where: { id: request.id },
      data: { createdAt: sevenDaysAgo },
    });

    await processor.runReminders(rightHour); // day-7 reminder fires
    expect(sendGate.send).toHaveBeenCalledTimes(1);
    refreshed = await prisma.reviewRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(refreshed.reminderCount).toBe(2);

    sendGate.send.mockClear();
    await processor.runReminders(rightHour); // max reached — no-op forever
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('never reminds a request that already has respondedAt set', async () => {
    const oldRequest = await prisma.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token: generateReviewToken(),
        source: 'order',
        createdAt: new Date(rightHour.getTime() - 10 * 24 * 60 * 60 * 1000),
        respondedAt: new Date(),
      },
    });

    await processor.runReminders(rightHour);
    expect(sendGate.send).not.toHaveBeenCalled();

    const refreshed = await prisma.reviewRequest.findUniqueOrThrow({
      where: { id: oldRequest.id },
    });
    expect(refreshed.reminderCount).toBe(0);
  });
});
