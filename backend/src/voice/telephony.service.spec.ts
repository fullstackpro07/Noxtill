import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TelephonyService } from './telephony.service';
import { AppException } from '../common/filters/app.exception';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('TelephonyService (UPD-BE-056)', () => {
  let prisma: PrismaService;
  let service: TelephonyService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const config = new ConfigService({
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'test-token',
      BACKEND_URL: 'http://localhost:5000/api/v1',
    });
    service = new TelephonyService(tenantPrisma, config);

    const business = await prisma.business.create({
      data: {
        name: 'Telephony Test Biz',
        slug: `telephony-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
  });

  afterAll(async () => {
    await prisma.phoneNumber.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('provisions a real number: searches available numbers, purchases one, and persists it', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { available_phone_numbers: [{ phone_number: '+15551230000' }] },
    });
    mockedAxios.post.mockResolvedValue({
      data: { sid: 'PN-real-sid', phone_number: '+15551230000' },
    });

    const result = await service.provisionNumber(businessId);
    expect(result.phoneNumber).toBe('+15551230000');
    expect(result.twilioSid).toBe('PN-real-sid');

    const [purchaseUrl, purchaseBody] = mockedAxios.post.mock.calls[0];
    expect(purchaseUrl).toContain('/IncomingPhoneNumbers.json');
    expect(String(purchaseBody)).toContain(
      'VoiceUrl=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fv1%2Fvoice%2Fwebhook%2Fincoming',
    );

    const stored = await prisma.phoneNumber.findUnique({
      where: { businessId },
    });
    expect(stored?.phoneNumber).toBe('+15551230000');
  });

  it('rejects provisioning a second number for a business that already has one', async () => {
    await expect(service.provisionNumber(businessId)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('fails cleanly when Twilio has no available numbers', async () => {
    await prisma.phoneNumber.deleteMany({ where: { businessId } });
    mockedAxios.get.mockResolvedValue({
      data: { available_phone_numbers: [] },
    });

    await expect(service.provisionNumber(businessId)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('fails cleanly (disclosed gap) when Twilio credentials are not configured', async () => {
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const unconfigured = new TelephonyService(
      tenantPrisma,
      new ConfigService({}),
    );
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await expect(
      unconfigured.provisionNumber(businessId),
    ).rejects.toBeInstanceOf(AppException);
  });
});
