import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import {
  isTestCaller,
  VoicePhoneSystemService,
} from './voice-phone-system.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const TRUNK = `TK${'a'.repeat(32)}`;

describe('VoicePhoneSystemService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoicePhoneSystemService;
  let businessId: string;
  const line = `+1415206${String(Date.now()).slice(-4)}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoicePhoneSystemService(
      tenant,
      new AuditService(tenant, cls as unknown as ClsService),
      {
        get: (key: string) =>
          ({ TWILIO_ACCOUNT_SID: 'AC_test', TWILIO_AUTH_TOKEN: 'token' })[key],
      } as unknown as ConfigService,
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Phone System Test',
          slug: `voice-phone-system-${Date.now()}`,
        },
      })
    ).id;
    await prisma.phoneNumber.create({
      data: { businessId, twilioSid: 'PN_ps', phoneNumber: line },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.voiceSettings.deleteMany({ where: { businessId } });
      await tx.phoneNumber.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  beforeEach(() => mockedAxios.get.mockReset());

  it('normalizes test numbers, rejects invalid ones, and tags matching callers', async () => {
    const saved = await service.setTestNumbers(businessId, [
      '+1 (415) 555-0123',
      '+14155550123',
    ]);
    expect(saved.testCallerNumbers).toEqual(['+14155550123']);
    await expect(
      service.setTestNumbers(businessId, ['12']),
    ).rejects.toBeInstanceOf(AppException);
    expect(await isTestCaller(prisma, businessId, '+14155550123')).toBe(true);
    expect(await isTestCaller(prisma, businessId, '+14155550999')).toBe(false);
  });

  it('connects only a trunk the provider confirms and reports whether the business line is on it', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('404'));
    await expect(
      service.connectTrunk(businessId, TRUNK),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.connectTrunk(businessId, 'not-a-trunk'),
    ).rejects.toBeInstanceOf(AppException);

    mockedAxios.get.mockImplementation((url: string) => {
      if (url.endsWith('/OriginationUrls')) {
        return Promise.resolve({
          data: {
            origination_urls: [
              { sip_url: 'sip:pbx.example.com', enabled: true },
            ],
          },
        });
      }
      if (url.endsWith('/PhoneNumbers')) {
        return Promise.resolve({
          data: { phone_numbers: [{ phone_number: line }] },
        });
      }
      return Promise.resolve({
        data: {
          sid: TRUNK,
          friendly_name: 'Office PBX',
          domain_name: 'office.pstn.twilio.com',
        },
      });
    });
    const trunk = await service.connectTrunk(businessId, TRUNK);
    expect(trunk).toMatchObject({
      sid: TRUNK,
      verified: true,
      name: 'Office PBX',
      businessLineOnTrunk: true,
      originationUrls: [{ sipUrl: 'sip:pbx.example.com', enabled: true }],
    });
    expect((await service.get(businessId)).sipTrunk).toMatchObject({
      sid: TRUNK,
    });
    await service.disconnectTrunk(businessId);
    expect((await service.get(businessId)).sipTrunk).toBeNull();
  });
});
