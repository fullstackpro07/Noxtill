import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { SpeechToTextService } from '../ai/speech-to-text.service';
import { VoiceMeetingArtifactsService } from './voice-meeting-artifacts.service';
import { VoiceVideoRecordingService } from './voice-video-recording.service';

describe('VoiceMeetingArtifactsService (real MySQL; simulated providers)', () => {
  const prisma = new PrismaService();
  const config = { get: () => undefined } as unknown as ConfigService;
  const audio = Buffer.from('bounded QA audio content');
  const storage = {
    storageMode: jest.fn((): 's3' | 'local' => 's3'),
    headObject: jest.fn(() =>
      Promise.resolve({ sizeBytes: audio.length, contentType: 'video/mp4' }),
    ),
    readObject: jest.fn(() => Promise.resolve(audio)),
    delete: jest.fn(() => Promise.resolve(undefined)),
  };
  const ai = {
    checkGuardrails: jest.fn(() => Promise.resolve(undefined)),
    complete: jest.fn(() =>
      Promise.resolve(
        JSON.stringify({
          summary:
            'The customer reviewed the service options and requested a follow-up.',
          followUpDraft:
            'Thanks for meeting. A team member will follow up about the service options.',
        }),
      ),
    ),
  };
  const speechToText = {
    transcribeWithMetrics: jest.fn(() =>
      Promise.resolve({
        text: 'Call 415-555-0123 or qa.person@example.com. Card 4111 1111 1111 1111. The customer reviewed service options.',
        audioSeconds: 47.25,
      }),
    ),
  };
  const queue = { add: jest.fn(() => Promise.resolve({ id: 'qa-job' })) };
  const service = new VoiceMeetingArtifactsService(
    prisma,
    storage as unknown as S3Service,
    ai as unknown as AiInfraService,
    speechToText as unknown as SpeechToTextService,
    queue as never,
  );
  const recordingService = new VoiceVideoRecordingService(
    prisma,
    config,
    storage as unknown as S3Service,
  );

  let businessId = '';
  let userId = '';
  let hostId = '';
  let customerId = '';
  let policyVersionId = '';
  let meetingId = '';
  let recordingId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: {
        name: 'QA Meeting Artifacts',
        slug: `qa-meeting-artifacts-${suffix}`,
      },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        name: 'QA Meeting Host',
        email: `qa-meeting-artifacts-${suffix}@example.com`,
        passwordHash: 'not-a-login',
      },
    });
    userId = user.id;
    const host = await prisma.businessUser.create({
      data: { businessId, userId, role: 'owner' },
    });
    hostId = host.id;
    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: '+15555550123',
        name: 'QA Meeting Customer',
        email: 'customer@example.com',
      },
    });
    customerId = customer.id;
  });

  async function createFixture(aiAllowed = true) {
    const pack = await prisma.voiceCompliancePolicyPack.create({
      data: {
        businessId,
        countryCode: 'US',
        purpose: 'meeting_recording',
        callerType: 'live_agent',
        versions: {
          create: {
            businessId,
            version: 1,
            aiDisclosureText: 'This is a test disclosure.',
            recordingAllowed: true,
            recordingNoticeText:
              'This meeting may be recorded for the agreed support purpose.',
            recordingRetentionDays: 30,
            meetingAiProcessingAllowed: aiAllowed,
            meetingAiProcessingNoticeText: aiAllowed
              ? 'Audio will be transcribed and summarized using AI for a human-reviewed follow-up.'
              : null,
            status: 'published',
            publishedAt: new Date(),
          },
        },
      },
      include: { versions: true },
    });
    policyVersionId = pack.versions[0].id;
    const meeting = await prisma.voiceVideoMeeting.create({
      data: {
        businessId,
        title: 'QA post-meeting summary',
        scheduledAt: new Date(Date.now() - 60_000),
        durationMin: 20,
        timeZone: 'UTC',
        hostBusinessUserId: hostId,
        createdByUserId: userId,
        customerId,
        recordingPolicyVersionId: policyVersionId,
        roomState: 'ended',
        status: 'ended',
      },
    });
    meetingId = meeting.id;
    const recording = await prisma.voiceVideoRecording.create({
      data: {
        businessId,
        meetingId,
        policyVersionId,
        startedByUserId: userId,
        status: 'ready',
        noticeSnapshot:
          'Recording and AI processing notice accepted by all attendees.',
        noticeHash: 'a'.repeat(64),
        regionCode: 'US',
        retentionDays: 30,
        retentionExpiresAt: new Date(Date.now() + 30 * 86_400_000),
        aiProcessingAllowed: aiAllowed,
        aiProcessingNoticeSnapshot: aiAllowed
          ? 'Audio will be transcribed and summarized using AI for a human-reviewed follow-up.'
          : null,
        storageKey: `qa/${suffixKey()}/recording.mp4`,
      },
    });
    recordingId = recording.id;
    await prisma.voiceVideoRecordingConsent.createMany({
      data: [
        {
          businessId,
          recordingId,
          identity: 'host:qa',
          role: 'host',
          decision: 'granted',
          noticeSnapshot: recording.noticeSnapshot,
          noticeHash: recording.noticeHash,
          source: 'host_confirmation',
          decidedAt: new Date(),
        },
        {
          businessId,
          recordingId,
          identity: 'guest:qa',
          role: 'guest',
          decision: 'granted',
          noticeSnapshot: recording.noticeSnapshot,
          noticeHash: recording.noticeHash,
          source: 'guest_confirmation',
          decidedAt: new Date(),
        },
      ],
    });
  }

  function suffixKey() {
    return randomUUID();
  }

  async function cleanupFixture() {
    if (meetingId) {
      await prisma.messageDraft.deleteMany({
        where: { businessId, sourceMeetingId: meetingId },
      });
      await prisma.voiceVideoMeeting.deleteMany({
        where: { id: meetingId, businessId },
      });
    }
    await prisma.voiceCompliancePolicyPack.deleteMany({
      where: { businessId },
    });
    await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    meetingId = '';
    recordingId = '';
    policyVersionId = '';
  }

  beforeEach(() => {
    jest.clearAllMocks();
    storage.storageMode.mockReturnValue('s3');
    ai.complete.mockResolvedValue(
      JSON.stringify({
        summary:
          'The customer reviewed the service options and requested a follow-up.',
        followUpDraft:
          'Thanks for meeting. A team member will follow up about the service options.',
      }),
    );
    speechToText.transcribeWithMetrics.mockResolvedValue({
      text: 'Call 415-555-0123 or qa.person@example.com. Card 4111 1111 1111 1111. The customer reviewed service options.',
      audioSeconds: 47.25,
    });
  });

  afterEach(async () => cleanupFixture());

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { id: customerId, businessId } });
    await prisma.businessUser.deleteMany({ where: { id: hostId, businessId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('requires policy authorization and affirmative consent from every participant before queuing', async () => {
    await createFixture(false);
    await expect(
      service.request(businessId, userId, meetingId, recordingId),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_AI_CONSENT_REQUIRED' },
    });
    expect(queue.add).not.toHaveBeenCalled();

    await cleanupFixture();
    await createFixture(true);
    await prisma.voiceVideoRecordingConsent.updateMany({
      where: { businessId, recordingId, role: 'guest' },
      data: { decision: 'declined' },
    });
    await expect(
      service.request(businessId, userId, meetingId, recordingId),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_MEETING_AI_CONSENT_REQUIRED' },
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('creates redacted transcript and reviewable AI output, then stores a canonical unsent inbox draft', async () => {
    await createFixture(true);
    await expect(
      service.request(businessId, userId, meetingId, recordingId),
    ).resolves.toMatchObject({ status: 'queued' });
    expect(queue.add).toHaveBeenCalledWith(
      'generate-video-ai-artifacts',
      { businessId, recordingId },
      expect.any(Object),
    );
    await expect(service.process(recordingId, businessId)).resolves.toEqual({
      status: 'ready',
    });

    const stored = await prisma.voiceVideoRecording.findUniqueOrThrow({
      where: { id: recordingId },
    });
    expect(stored).toMatchObject({
      artifactStatus: 'ready',
      aiProcessingAllowed: true,
    });
    expect(stored.transcriptText).toContain('[phone number]');
    expect(stored.transcriptText).toContain('[email]');
    expect(stored.transcriptText).toContain('[card number]');
    expect(stored.transcriptText).not.toContain('415-555-0123');
    expect(stored.transcriptText).not.toContain('qa.person@example.com');
    expect(ai.checkGuardrails).toHaveBeenCalledWith(
      businessId,
      'voice_meeting_summary',
    );
    expect(ai.complete).toHaveBeenCalledWith(
      businessId,
      expect.stringContaining('[phone number]'),
      0,
      'voice_meeting_summary',
      900,
    );
    expect(
      await prisma.voiceUsageRecord.findUnique({
        where: {
          businessId_eventKey: {
            businessId,
            eventKey: `meeting-transcription:${recordingId}`,
          },
        },
      }),
    ).toMatchObject({ unit: 'meeting_transcription_bytes', state: 'unpriced' });
    const storageEgress = await prisma.voiceUsageRecord.findUniqueOrThrow({
      where: {
        businessId_eventKey: {
          businessId,
          eventKey: `storage:egress:meeting-transcription:${recordingId}`,
        },
      },
    });
    expect(storageEgress).toMatchObject({
      unit: 'recording_storage_egress_bytes',
      state: 'unpriced',
      cost: null,
    });
    expect(Number(storageEgress.quantity)).toBe(audio.length);
    const transcriptionUsage = await prisma.voiceUsageRecord.findUniqueOrThrow({
      where: {
        businessId_eventKey: {
          businessId,
          eventKey: `meeting-transcription-audio:${recordingId}`,
        },
      },
    });
    expect(transcriptionUsage).toMatchObject({
      provider: 'openai',
      unit: 'transcription_audio_seconds',
      state: 'unpriced',
      cost: null,
    });
    expect(Number(transcriptionUsage.quantity)).toBe(47.25);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: recordingId,
          action: 'voice.meeting.ai_artifacts_generated',
        },
      }),
    ).toBe(1);

    const draft = await service.createFollowUpDraft(
      businessId,
      userId,
      meetingId,
      recordingId,
    );
    expect(draft).toMatchObject({ status: 'draft', sent: false });
    expect(
      await prisma.messageDraft.findUniqueOrThrow({ where: { id: draft.id } }),
    ).toMatchObject({
      businessId,
      customerId,
      sourceMeetingId: meetingId,
      status: 'draft',
      body: 'Thanks for meeting. A team member will follow up about the service options.',
    });
    await expect(service.process(recordingId, businessId)).resolves.toEqual({
      status: 'skipped',
    });
  });

  it('does not call local-disk reads cloud storage egress', async () => {
    await createFixture(true);
    storage.storageMode.mockReturnValue('local');
    await service.request(businessId, userId, meetingId, recordingId);
    await expect(service.process(recordingId, businessId)).resolves.toEqual({
      status: 'ready',
    });
    expect(
      await prisma.voiceUsageRecord.count({
        where: {
          businessId,
          eventKey: `storage:egress:meeting-transcription:${recordingId}`,
        },
      }),
    ).toBe(0);
  });

  it('clears derived transcript, summary and unsent draft when recording retention expires', async () => {
    await createFixture(true);
    await service.request(businessId, userId, meetingId, recordingId);
    await service.process(recordingId, businessId);
    await service.createFollowUpDraft(
      businessId,
      userId,
      meetingId,
      recordingId,
    );
    await prisma.voiceVideoRecording.update({
      where: { id: recordingId },
      data: { retentionExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      recordingService.expireReadyRecordings(),
    ).resolves.toMatchObject({ deleted: 1 });
    expect(storage.delete).toHaveBeenCalledWith(expect.stringContaining('qa/'));
    expect(
      await prisma.voiceVideoRecording.findUniqueOrThrow({
        where: { id: recordingId },
      }),
    ).toMatchObject({
      status: 'deleted',
      storageKey: null,
      transcriptText: null,
      generatedSummary: null,
      followUpDraft: null,
      artifactStatus: 'deleted',
    });
    expect(
      await prisma.messageDraft.count({
        where: { businessId, sourceMeetingId: meetingId, status: 'draft' },
      }),
    ).toBe(0);
  });
});
