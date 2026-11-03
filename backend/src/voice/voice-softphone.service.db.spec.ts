import { createHmac, randomUUID } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { Role, VoiceAgentPresenceStatus } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceSoftphoneService } from './voice-softphone.service';
import { voiceSoftphoneIdentity } from './voice-softphone.util';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('VoiceSoftphoneService (real MySQL)', () => {
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let audit: AuditService;
  let cls: FakeClsService;
  let service: VoiceSoftphoneService;
  let businessId: string;
  let userId: string;
  let profileId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    audit = new AuditService(tenant, cls as unknown as ClsService);

    const stamp = randomUUID();
    const business = await prisma.business.create({
      data: { name: 'Voice Softphone QA', slug: `voice-softphone-${stamp}` },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        email: `voice-softphone-${stamp}@example.com`,
        passwordHash: 'test-hash',
        name: 'Softphone Agent',
      },
    });
    userId = user.id;
    const businessUser = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    const profile = await prisma.voiceHumanAgentProfile.create({
      data: {
        businessId,
        staffUserId: businessUser.id,
        active: true,
        presenceStatus: VoiceAgentPresenceStatus.available,
        lastHeartbeatAt: new Date(),
      },
    });
    profileId = profile.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
    service = new VoiceSoftphoneService(
      tenant,
      config({
        TWILIO_ACCOUNT_SID: 'AC12345678901234567890123456789012',
        TWILIO_API_KEY_SID: 'SK12345678901234567890123456789012',
        TWILIO_API_KEY_SECRET: 'test-api-secret',
        TWILIO_TWIML_APP_SID: 'AP12345678901234567890123456789012',
      }),
      audit,
    );
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.voiceHumanAgentProfile.deleteMany({ where: { businessId } });
      await prisma.businessUser.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('issues a short-lived signed Twilio token for the linked active profile', async () => {
    const issued = await service.issueToken(businessId, userId);
    const [header, encodedPayload, signature] = issued.token.split('.');
    const expectedSignature = createHmac('sha256', 'test-api-secret')
      .update(`${header}.${encodedPayload}`)
      .digest('base64url');
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as {
      sub: string;
      exp: number;
      grants: {
        identity: string;
        voice: {
          incoming: { allow: boolean };
          outgoing: { application_sid: string };
        };
      };
    };

    expect(signature).toBe(expectedSignature);
    expect(issued.identity).toBe(payload.grants.identity);
    expect(issued.identity).toBe(voiceSoftphoneIdentity(businessId, profileId));
    expect(payload).toMatchObject({
      sub: 'AC12345678901234567890123456789012',
      grants: {
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: 'AP12345678901234567890123456789012' },
        },
      },
    });
    expect(issued.expiresInSeconds).toBe(3600);
  });

  it('shows Not configured and refuses tokens when Twilio credentials are absent', async () => {
    const unconfigured = new VoiceSoftphoneService(tenant, config({}), audit);

    await expect(
      unconfigured.status(businessId, userId),
    ).resolves.toMatchObject({
      configured: false,
      status: 'not_configured',
    });
    await expect(
      unconfigured.issueToken(businessId, userId),
    ).rejects.toBeInstanceOf(AppException);
  });
});
