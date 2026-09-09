import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceLiveJoinService } from './voice-live-join.service';
import { AppException } from '../common/filters/app.exception';
import { PhoneCallStatus } from '@prisma/client';

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

describe('VoiceLiveJoinService (Live Calls listen/take-over depth fix)', () => {
  let prisma: PrismaService;
  let service: VoiceLiveJoinService;
  let businessId: string;
  let userId: string;

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
    service = new VoiceLiveJoinService(tenantPrisma, config);

    const business = await prisma.business.create({
      data: {
        name: 'Live Join Test Biz',
        slug: `live-join-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        name: 'Staff Member',
        email: `staff-${Date.now()}@example.com`,
        phone: '+15557778888',
        passwordHash: 'hash',
      },
    });
    userId = user.id;

    // A number distinct from every other spec file's hardcoded number — `phoneNumber` is globally
    // unique, and these specs share a real DB within the same test run.
    await prisma.phoneNumber.create({
      data: {
        businessId,
        twilioSid: 'PN-live-join-test',
        phoneNumber: `+1555${String(Date.now()).slice(-7)}`,
      },
    });
  });

  afterEach(() => {
    mockedAxios.post.mockReset();
  });

  afterAll(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.phoneNumber.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('listen() redirects the live caller leg AND dials the staff member in muted', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-listen-1',
        fromNumber: '+15550001111',
        status: PhoneCallStatus.in_progress,
      },
    });
    mockedAxios.post.mockResolvedValue({ data: {} });

    const updated = await service.listen(businessId, userId, call.id);
    expect(updated.joinedAt).not.toBeNull();
    expect(updated.joinedByUserId).toBe(userId);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    const [redirectUrl, redirectBody] = mockedAxios.post.mock.calls[0];
    expect(redirectUrl).toContain(`/Calls/${call.callSid}.json`);
    expect(String(redirectBody)).toContain('role%3Dcaller');

    const [dialUrl, dialBody] = mockedAxios.post.mock.calls[1];
    expect(dialUrl).toContain('/Calls.json');
    expect(String(dialBody)).toContain('To=%2B15557778888');
    expect(String(dialBody)).toContain('muted%3Dtrue');
  });

  it('takeOver() dials the staff member in unmuted and does not re-redirect an already-joined call', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-takeover-1',
        fromNumber: '+15550002222',
        status: PhoneCallStatus.in_progress,
        joinedAt: new Date(),
        joinedByUserId: userId,
      },
    });
    mockedAxios.post.mockResolvedValue({ data: {} });

    await service.takeOver(businessId, userId, call.id);

    // Already joined — only the second staff-dial call happens, not another live-call redirect.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [dialUrl, dialBody] = mockedAxios.post.mock.calls[0];
    expect(dialUrl).toContain('/Calls.json');
    expect(String(dialBody)).toContain('muted%3Dfalse');
  });

  it('rejects joining a call that is no longer in progress', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-ended-1',
        fromNumber: '+15550003333',
        status: PhoneCallStatus.completed,
      },
    });

    await expect(
      service.listen(businessId, userId, call.id),
    ).rejects.toBeInstanceOf(AppException);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejects joining when the requesting user has no phone number on file', async () => {
    const noPhoneUser = await prisma.user.create({
      data: {
        name: 'No Phone Staff',
        email: `no-phone-${Date.now()}@example.com`,
        passwordHash: 'hash',
      },
    });
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: 'CA-no-phone-1',
        fromNumber: '+15550004444',
        status: PhoneCallStatus.in_progress,
      },
    });

    await expect(
      service.listen(businessId, noPhoneUser.id, call.id),
    ).rejects.toBeInstanceOf(AppException);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();

    await prisma.user.delete({ where: { id: noPhoneUser.id } });
  });

  it('conferenceTwiml() sets endConferenceOnExit=true only for the caller role', () => {
    const callerXml = service.conferenceTwiml('room-1', false, 'caller');
    expect(callerXml).toContain('endConferenceOnExit="true"');
    expect(callerXml).toContain('muted="false"');

    const staffXml = service.conferenceTwiml('room-1', true, 'staff');
    expect(staffXml).toContain('endConferenceOnExit="false"');
    expect(staffXml).toContain('muted="true"');
  });
});
