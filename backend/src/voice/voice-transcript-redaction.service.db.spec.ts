import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceTranscriptRedactionService } from './voice-transcript-redaction.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const turn = (text: string) => ({
  speaker: 'caller',
  text,
  at: new Date().toISOString(),
});

describe('VoiceTranscriptRedactionService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceTranscriptRedactionService;
  let onId: string;
  let offId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceTranscriptRedactionService(
      tenant,
      prisma,
      new AuditService(tenant, cls as unknown as ClsService),
    );
    onId = (
      await prisma.business.create({
        data: {
          name: 'Redaction On',
          slug: `voice-redact-on-${suffix}`,
          policies: { 'voice.redactTranscripts': true },
        },
      })
    ).id;
    offId = (
      await prisma.business.create({
        data: { name: 'Redaction Off', slug: `voice-redact-off-${suffix}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, onId);
    cls.set(CLS_KEY_USER_ID, 'redaction-tester');
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.phoneCall.deleteMany({
        where: { businessId: { in: [onId, offId] } },
      });
      await tx.business.deleteMany({ where: { id: { in: [onId, offId] } } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  function call(
    businessId: string,
    name: string,
    extra: Record<string, unknown> = {},
  ) {
    return prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-red-${name}-${suffix}`,
        fromNumber: '+14155550199',
        status: 'completed',
        transcript: [
          turn('My card is 4242 4242 4242 4242 and email jo@example.com'),
        ],
        summary: 'Caller jo@example.com wants a refund.',
        ...extra,
      },
    });
  }

  it('redacts finished calls only for opted-in businesses, skipping live and held calls', async () => {
    const done = await call(onId, 'done');
    const live = await call(onId, 'live', { status: 'in_progress' });
    const held = await call(onId, 'held', {
      legalHoldAt: new Date(),
      legalHoldReason: 'Dispute',
    });
    const other = await call(offId, 'other');

    await service.runPending();

    const after = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: done.id },
    });
    expect(after.transcript).toEqual([
      expect.objectContaining({
        text: 'My card is [card number] and email [email]',
      }),
    ]);
    expect(after.summary).toBe('Caller [email] wants a refund.');
    expect(after.transcriptRedactionCount).toBe(3);
    expect(after.transcriptRedactedAt).not.toBeNull();
    for (const untouched of [live, held, other]) {
      const row = await prisma.phoneCall.findUniqueOrThrow({
        where: { id: untouched.id },
      });
      expect(row.transcriptRedactedAt).toBeNull();
      expect(JSON.stringify(row.transcript)).toContain('4242 4242 4242 4242');
    }
    expect(
      await prisma.auditLog.count({
        where: {
          businessId: onId,
          entityId: done.id,
          action: 'call.transcript_redacted',
        },
      }),
    ).toBe(1);
  });

  it('redacts on demand but refuses a call on legal hold', async () => {
    const manual = await call(onId, 'manual');
    await expect(service.redactCall(onId, manual.id)).resolves.toEqual({
      id: manual.id,
      redactions: 3,
    });
    const held = await call(onId, 'manual-held', {
      legalHoldAt: new Date(),
      legalHoldReason: 'Dispute',
    });
    let caught: unknown;
    try {
      await service.redactCall(onId, held.id);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    expect((caught as AppException).getResponse()).toMatchObject({
      code: 'VOICE_RECORDING_LEGAL_HOLD',
    });
  });
});
