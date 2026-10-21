import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceNumberFeesService } from './voice-number-fees.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VoiceNumberFeesService (real MySQL)', () => {
  let prisma: PrismaService;
  let businessId: string;
  const suffix = `${Date.now()}`.slice(-6);
  const line = `+1415207${suffix.slice(-4)}`;
  const tracked = `+1415208${suffix.slice(-4)}`;
  const inactive = `+1415209${suffix.slice(-4)}`;
  const config = (withKeys: boolean) =>
    ({
      get: (key: string) =>
        withKeys
          ? (
              {
                TWILIO_ACCOUNT_SID: 'AC_test',
                TWILIO_AUTH_TOKEN: 'token',
              } as Record<string, string>
            )[key]
          : undefined,
    }) as unknown as ConfigService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: { name: 'Number Fees', slug: `number-fees-${Date.now()}` },
      })
    ).id;
    await prisma.phoneNumber.create({
      data: { businessId, twilioSid: `PNline${suffix}`, phoneNumber: line },
    });
    await prisma.voiceTrackingNumber.createMany({
      data: [
        {
          businessId,
          phoneNumber: tracked,
          twilioSid: `PNtrk${suffix}`,
          label: 'Ads',
          source: 'google',
          channel: 'paid',
          provisionedVia: 'purchased',
          createdByUserId: 'x',
        },
        {
          businessId,
          phoneNumber: inactive,
          twilioSid: `PNold${suffix}`,
          label: 'Old',
          source: 'print',
          channel: 'offline',
          provisionedVia: 'purchased',
          createdByUserId: 'x',
          active: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.voiceUsageRecord.deleteMany({ where: { businessId } });
      await tx.voiceTrackingNumber.deleteMany({ where: { businessId } });
      await tx.phoneNumber.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('records one estimated number-month per active number, idempotently', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        price_unit: 'USD',
        phone_number_prices: [
          { number_type: 'local', base_price: '1.15', current_price: '1.15' },
        ],
      },
    });
    const service = new VoiceNumberFeesService(prisma, config(true));
    const month = new Date('2026-09-15T12:00:00Z');
    await service.recordMonth(month);
    await service.recordMonth(month);
    const rows = await prisma.voiceUsageRecord.findMany({
      where: { businessId, unit: 'phone_number_months' },
    });
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (r) =>
          r.state === 'estimated' &&
          r.currency === 'USD' &&
          Number(r.cost) === 1.15,
      ),
    ).toBe(true);
    expect(
      rows.map((r) => (r.evidence as { kind: string }).kind).sort(),
    ).toEqual(['business_line', 'tracking_number']);
    expect(JSON.stringify(rows.map((r) => r.evidence))).not.toContain(line);
  });

  it('records unpriced rows when provider credentials are missing', async () => {
    const service = new VoiceNumberFeesService(prisma, config(false));
    await service.recordMonth(new Date('2026-10-02T00:00:00Z'));
    const october = await prisma.voiceUsageRecord.findMany({
      where: {
        businessId,
        unit: 'phone_number_months',
        eventKey: { endsWith: ':2026-10' },
      },
    });
    expect(october).toHaveLength(2);
    expect(
      october.every((r) => r.state === 'unpriced' && r.cost === null),
    ).toBe(true);
  });
});
