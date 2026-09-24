import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { S3Service } from '../common/storage/s3.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceCallWorkspaceService } from './voice-call-workspace.service';
import { AppException } from '../common/filters/app.exception';
import { PhoneCallStatus, Prisma } from '@prisma/client';

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

describe('VoiceCallWorkspaceService (AI Phone, full — call workspace actions)', () => {
  let prisma: PrismaService;
  let service: VoiceCallWorkspaceService;
  let businessId: string;
  let userId: string;
  let callCounter = 0;

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
    });
    const audit = new AuditService(tenantPrisma, cls as unknown as ClsService);
    const s3 = new S3Service(new ConfigService({}));
    service = new VoiceCallWorkspaceService(tenantPrisma, config, audit, s3);

    const business = await prisma.business.create({
      data: {
        name: 'Call Workspace Test Biz',
        slug: `voice-workspace-${Date.now()}`,
      },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        email: `voice-workspace-${Date.now()}@example.com`,
        passwordHash: 'x',
        name: 'Staffer',
      },
    });
    userId = user.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  afterAll(async () => {
    await prisma.phoneCallNote.deleteMany({ where: { businessId } });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  function createCall(overrides: {
    status?: PhoneCallStatus;
    recordingKey?: string | null;
    transcript?: unknown[];
  }) {
    callCounter += 1;
    return prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-workspace-${callCounter}`,
        fromNumber: '+15550000000',
        status: overrides.status ?? PhoneCallStatus.in_progress,
        recordingKey: overrides.recordingKey ?? null,
        transcript: (overrides.transcript ?? []) as Prisma.InputJsonValue,
      },
    });
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('adds a note and logs it to the real audit trail', async () => {
    const call = await createCall({});
    const note = await service.addNote(businessId, userId, call.id, {
      body: 'Called back, no answer.',
    });
    expect(note.body).toBe('Called back, no answer.');

    const notes = await service.listNotes(call.id);
    expect(notes).toHaveLength(1);

    const logs = await prisma.auditLog.findMany({
      where: {
        entity: 'PhoneCall',
        entityId: call.id,
        action: 'call.note_added',
      },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorUserId).toBe(userId);
  });

  it('deletes a recording for real — clears the key and removes the transcript words, keeping the call log', async () => {
    const call = await createCall({
      recordingKey: 'voice-recordings/test/one.mp3',
      transcript: [
        {
          speaker: 'caller',
          text: 'Hello',
          at: '1',
          recordingKey: 'voice-recordings/test/one.mp3',
        },
        { speaker: 'assistant', text: 'Hi there', at: '2' },
      ],
    });
    const result = await service.deleteRecording(businessId, call.id);
    expect(result.recordingDeletedAt).toBeTruthy();

    const updated = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(updated.recordingKey).toBeNull();
    expect(updated.recordingDeletedAt).not.toBeNull();
    // What the caller said is gone; the call row itself (outcome, times, number) stays.
    expect(updated.transcript).toEqual([]);
    expect(updated.fromNumber).toBe('+15550000000');

    const logs = await prisma.auditLog.findMany({
      where: {
        entity: 'PhoneCall',
        entityId: call.id,
        action: 'call.recording_deleted',
      },
    });
    expect(logs).toHaveLength(1);
  });

  it('transfers a live call via the real Twilio "modify a live call" action and records the outcome', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });
    const call = await createCall({ status: PhoneCallStatus.in_progress });
    const result = await service.transfer(businessId, call.id, {
      toNumber: '+15551234567',
    });
    expect(result.outcome).toBe('transfer');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, body] = mockedAxios.post.mock.calls[0] as [
      string,
      URLSearchParams,
    ];
    expect(url).toContain(`Calls/${call.callSid}.json`);
    expect(body.get('Twiml')).toContain('+15551234567');

    const updated = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(updated.outcome).toBe('transfer');
  });

  it('refuses to transfer or end a call that is no longer live', async () => {
    const call = await createCall({ status: PhoneCallStatus.completed });
    await expect(
      service.transfer(businessId, call.id, {}),
    ).rejects.toBeInstanceOf(AppException);
    await expect(service.endCall(businessId, call.id)).rejects.toBeInstanceOf(
      AppException,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('refuses to transfer with no transfer number configured anywhere', async () => {
    const call = await createCall({ status: PhoneCallStatus.in_progress });
    await expect(
      service.transfer(businessId, call.id, {}),
    ).rejects.toBeInstanceOf(AppException);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('ends a live call via the real Twilio status-modify action', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });
    const call = await createCall({ status: PhoneCallStatus.in_progress });
    const result = await service.endCall(businessId, call.id);
    expect(result.ending).toBe(true);

    const [url, body] = mockedAxios.post.mock.calls[0] as [
      string,
      URLSearchParams,
    ];
    expect(url).toContain(`Calls/${call.callSid}.json`);
    expect(body.get('Status')).toBe('completed');
  });

  it('never lets one business act on another’s call', async () => {
    const other = await prisma.business.create({
      data: {
        name: 'Other Workspace Biz',
        slug: `voice-workspace-other-${Date.now()}`,
      },
    });
    try {
      const otherCall = await prisma.phoneCall.create({
        data: {
          businessId: other.id,
          callSid: `CA-other-${Date.now()}`,
          fromNumber: '+15550000001',
          status: PhoneCallStatus.in_progress,
          transcript: [],
        },
      });
      await expect(
        service.addNote(businessId, userId, otherCall.id, { body: 'nope' }),
      ).rejects.toThrow();
      await expect(
        service.deleteRecording(businessId, otherCall.id),
      ).rejects.toThrow();
    } finally {
      await prisma.phoneCall.deleteMany({ where: { businessId: other.id } });
      await prisma.business.delete({ where: { id: other.id } });
    }
  });
});
