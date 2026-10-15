import axios from 'axios';
import { randomUUID } from 'crypto';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { SpeechToTextService } from '../ai/speech-to-text.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppointmentsService } from '../bookings/appointments.service';
import { MissedCallService } from './missed-call.service';
import { VoiceCallService } from './voice-call.service';
import { VoiceHumanAgentDispatchService } from './voice-human-agent-dispatch.service';
import { AUTOMATED_ASSISTANT_DISCLOSURE_TEXT } from './voice.constants';
import {
  AppointmentSource,
  PhoneCallStatus,
  PhoneCallOutcome,
  Prisma,
  Role,
  VoiceAgentPresenceStatus,
} from '@prisma/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VoiceCallService (UPD-BE-057/058/059)', () => {
  let prisma: PrismaService;
  let service: VoiceCallService;
  let businessId: string;
  let serviceProductId: string;
  let inboundRecordingPackId: string;
  const s3 = {
    upload: jest.fn(),
    getSignedDownloadUrl: jest.fn(),
    delete: jest.fn(),
  };
  const speechToText = { transcribe: jest.fn() };
  const aiInfra = { complete: jest.fn() };
  const appointments = { createWalkIn: jest.fn() };
  const missedCall = { notify: jest.fn() };
  let config: ConfigService;
  let baseHandleIncoming: VoiceCallService['handleIncoming'];
  let baseHandleRecording: VoiceCallService['handleRecording'];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: {
        name: 'Voice Call Test Biz',
        slug: `voice-call-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    await prisma.phoneNumber.create({
      data: {
        businessId,
        twilioSid: 'PN-test',
        phoneNumber: '+15559990000',
      },
    });
    const recordingPolicy = await prisma.voiceCompliancePolicyPack.create({
      data: {
        businessId,
        countryCode: 'US',
        purpose: 'inbound_recording',
        callerType: 'ai_voice',
        versions: {
          create: {
            businessId,
            version: 1,
            aiDisclosureText: 'You are speaking with an automated assistant.',
            recordingAllowed: true,
            recordingNoticeText: 'This call may be recorded. Press 1 to agree.',
            recordingRetentionDays: 30,
            status: 'published',
            publishedAt: new Date(),
          },
        },
      },
    });
    inboundRecordingPackId = recordingPolicy.id;
    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'service',
        name: 'Haircut',
        costPrice: 5,
        sellingPrice: 25,
        durationMin: 30,
      },
    });
    serviceProductId = product.id;

    config = new ConfigService({
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'test-token',
      BACKEND_URL: 'https://voice-test.example/api/v1',
      VOICE_TRANSFER_NUMBER: '',
    });
    service = new VoiceCallService(
      prisma,
      config,
      s3 as unknown as S3Service,
      speechToText as unknown as SpeechToTextService,
      aiInfra as unknown as AiInfraService,
      appointments as unknown as AppointmentsService,
      missedCall as unknown as MissedCallService,
      new VoiceHumanAgentDispatchService(prisma),
    );
    baseHandleIncoming = (callSid, fromNumber, toNumber) =>
      VoiceCallService.prototype.handleIncoming.call(
        service,
        callSid,
        fromNumber,
        toNumber,
      ) as Promise<string>;
    baseHandleRecording = (callSid, recordingUrl) =>
      VoiceCallService.prototype.handleRecording.call(
        service,
        callSid,
        recordingUrl,
      ) as Promise<string>;
  });

  beforeEach(() => {
    mockedAxios.get.mockResolvedValue({ data: new ArrayBuffer(8) });
    s3.upload.mockResolvedValue(undefined);
    speechToText.transcribe.mockResolvedValue('I would like a haircut');
    // Legacy conversation tests model callers who accept the published notice.
    // The focused consent cases call baseHandleIncoming directly to test the real choices.
    service.handleIncoming = async (...args) => {
      const xml = await baseHandleIncoming(...args);
      if (args[0] !== 'CA-real-1' && xml.includes('<Gather')) {
        await service.handleRecordingConsent(args[0], '1');
      }
      return xml;
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.voiceCompliancePolicyPack.deleteMany({
      where: { businessId },
    });
    await prisma.voiceAiAgentTestRun.deleteMany({ where: { businessId } });
    await prisma.voiceAiAgentVersion.deleteMany({ where: { businessId } });
    await prisma.voiceAiAgent.deleteMany({ where: { businessId } });
    await prisma.voiceKnowledgeEntry.deleteMany({ where: { businessId } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.phoneNumber.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  describe('handleIncoming()', () => {
    it('screens a warm transfer on the called leg and confirms it only from the provider callback', async () => {
      const call = await prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-warm-transfer-${randomUUID()}`,
          fromNumber: '+14155550111',
          status: PhoneCallStatus.in_progress,
          callerName: 'Taylor Customer',
          transcript: [
            {
              speaker: 'caller',
              text: 'I need to move my appointment to Friday',
              at: new Date().toISOString(),
            },
          ] as Prisma.InputJsonValue,
        },
      });
      const transfer = await prisma.voiceCallTransfer.create({
        data: {
          businessId,
          callId: call.id,
          attemptNumber: 1,
          mode: 'warm',
          destination: '+14155550222',
          status: 'pending',
        },
      });

      const screeningXml = await service.transferScreening(
        call.id,
        transfer.attemptNumber,
        'CA-destination-leg',
      );
      expect(screeningXml).toContain('Warm transfer from Noxtill.');
      expect(screeningXml).toContain('Caller name: Taylor Customer.');
      expect(screeningXml).toContain(
        'Caller context: I need to move my appointment to Friday',
      );

      const screened = await prisma.voiceCallTransfer.findUniqueOrThrow({
        where: { id: transfer.id },
      });
      expect(screened).toMatchObject({
        status: 'pending',
        providerStatus: 'warm_screening',
        providerCallSid: 'CA-destination-leg',
      });

      await service.handleTransferResult(
        call.callSid,
        'completed',
        undefined,
        transfer.attemptNumber,
        'CA-destination-leg',
      );
      const confirmed = await prisma.voiceCallTransfer.findUniqueOrThrow({
        where: { id: transfer.id },
      });
      expect(confirmed.status).toBe('provider_confirmed');
      expect(confirmed.confirmedAt).not.toBeNull();
    });

    it('rejects a call to an unrecognized number without creating a PhoneCall row', async () => {
      const xml = await service.handleIncoming(
        'CA-unknown-number',
        '+14155550101',
        '+19990000000',
      );
      expect(xml).toContain('<Hangup/>');
      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-unknown-number' },
      });
      expect(call).toBeNull();
    });

    it('routes over-cap calls around AI and IVR, records the reason, and keeps the caller eligible for human follow-up', async () => {
      const seedSid = `CA-cap-seed-${randomUUID()}`;
      const blockedSid = `CA-cap-blocked-${randomUUID()}`;
      const monthStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );
      await prisma.phoneCall.create({
        data: {
          businessId,
          callSid: seedSid,
          fromNumber: '+14155550114',
          status: PhoneCallStatus.completed,
          transcript: [],
          startedAt: new Date(),
        },
      });
      const original = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { policies: true },
      });
      const restorePolicies = original.policies as Prisma.InputJsonValue;
      const existingAdmitted = await prisma.phoneCall.count({
        where: {
          businessId,
          startedAt: { gte: monthStart },
          quotaRejectedAt: null,
        },
      });
      const originalPolicies =
        original.policies &&
        typeof original.policies === 'object' &&
        !Array.isArray(original.policies)
          ? original.policies
          : {};
      await prisma.business.update({
        where: { id: businessId },
        data: {
          policies: {
            ...originalPolicies,
            'voice.maxInboundCallsPerMonth': existingAdmitted,
          },
        },
      });

      try {
        const xml = await baseHandleIncoming(
          blockedSid,
          '+14155550115',
          '+15559990000',
        );
        const blocked = await prisma.phoneCall.findUniqueOrThrow({
          where: { callSid: blockedSid },
        });
        expect(xml).toContain('automated assistant is unavailable');
        expect(xml).toContain('<Hangup/>');
        expect(xml).not.toContain('<Gather');
        expect(blocked).toMatchObject({
          status: PhoneCallStatus.in_progress,
          outcome: PhoneCallOutcome.message,
          voiceAgentVersionId: null,
          ivrFlowVersionId: null,
          recordingConsentStatus: 'not_allowed',
          quotaRejectedReason: `Monthly automated-call limit reached (${existingAdmitted}).`,
        });
        expect(blocked.quotaRejectedAt).not.toBeNull();
        const blockedTurns = blocked.transcript as unknown as Array<{
          speaker: string;
          text: string;
        }>;
        expect(
          blockedTurns.some(
            (turn) =>
              turn.speaker === 'assistant' &&
              turn.text.includes('No team member is available'),
          ),
        ).toBe(true);
      } finally {
        await prisma.business.update({
          where: { id: businessId },
          data: { policies: restorePolicies },
        });
      }
    });

    it('does not block inbound calls when the monthly cap is unset', async () => {
      const callSid = `CA-cap-unset-${randomUUID()}`;
      const xml = await baseHandleIncoming(
        callSid,
        '+14155550116',
        '+15559990000',
      );
      const call = await prisma.phoneCall.findUniqueOrThrow({
        where: { callSid },
      });
      expect(xml).toContain('<Gather');
      expect(call.status).toBe(PhoneCallStatus.in_progress);
      expect(call.quotaRejectedAt).toBeNull();
      expect(call.quotaRejectedReason).toBeNull();
    });

    it('serializes simultaneous admissions so one call cannot exceed the configured cap', async () => {
      const monthStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );
      const original = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { policies: true },
      });
      const restorePolicies = original.policies as Prisma.InputJsonValue;
      const originalPolicies =
        original.policies &&
        typeof original.policies === 'object' &&
        !Array.isArray(original.policies)
          ? original.policies
          : {};
      const existingAdmitted = await prisma.phoneCall.count({
        where: {
          businessId,
          startedAt: { gte: monthStart },
          quotaRejectedAt: null,
        },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: {
          policies: {
            ...originalPolicies,
            'voice.maxInboundCallsPerMonth': existingAdmitted + 1,
          },
        },
      });

      const callSids = [
        `CA-cap-race-a-${randomUUID()}`,
        `CA-cap-race-b-${randomUUID()}`,
      ];
      try {
        await Promise.all(
          callSids.map((callSid, index) =>
            baseHandleIncoming(
              callSid,
              `+141555501${17 + index}`,
              '+15559990000',
            ),
          ),
        );
        const calls = await prisma.phoneCall.findMany({
          where: { businessId, callSid: { in: callSids } },
        });
        expect(calls).toHaveLength(2);
        expect(calls.filter((call) => !call.quotaRejectedAt)).toHaveLength(1);
        expect(calls.filter((call) => call.quotaRejectedAt)).toHaveLength(1);
      } finally {
        await prisma.business.update({
          where: { id: businessId },
          data: { policies: restorePolicies },
        });
      }
    });

    it('announces the policy and waits for explicit consent before recording', async () => {
      const xml = await service.handleIncoming(
        'CA-real-1',
        '+14155550101',
        '+15559990000',
      );
      expect(xml).toContain(AUTOMATED_ASSISTANT_DISCLOSURE_TEXT);
      expect(xml).toContain('Press 1 to agree');
      expect(xml).toContain('<Gather');
      expect(xml).not.toContain('<Record');

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-real-1' },
      });
      expect(call?.businessId).toBe(businessId);
      expect(call?.status).toBe('in_progress');
      expect(call?.recordingConsentStatus).toBe('pending');
      expect(call?.recordingRetentionDays).toBe(30);
      expect(call?.recordingNoticeSnapshot).toContain('Press 1 to agree');
    });

    it('does not record without a published policy for the caller country', async () => {
      const xml = await baseHandleIncoming(
        'CA-no-policy',
        '+442079460018',
        '+15559990000',
      );
      expect(xml).not.toContain('<Gather');
      expect(xml).not.toContain('<Record');
      expect(xml).toContain('You are speaking with an automated assistant');
      expect(xml).toContain('Recording is not configured for your region');
      expect(xml).toContain('No message was recorded');
      const call = await prisma.phoneCall.findUniqueOrThrow({
        where: { callSid: 'CA-no-policy' },
      });
      expect(call.recordingConsentStatus).toBe('not_configured');
    });

    it('starts recording only after the caller affirmatively presses 1', async () => {
      await baseHandleIncoming(
        'CA-consent-yes',
        '+14155550132',
        '+15559990000',
      );
      const before = await prisma.phoneCall.findUniqueOrThrow({
        where: { callSid: 'CA-consent-yes' },
      });
      expect(before.recordingConsentStatus).toBe('pending');

      const xml = await service.handleRecordingConsent('CA-consent-yes', '1');
      const after = await prisma.phoneCall.findUniqueOrThrow({
        where: { callSid: 'CA-consent-yes' },
      });
      expect(xml).toContain('<Record');
      expect(after.recordingConsentStatus).toBe('granted');
      expect(after.recordingConsentAt).toBeInstanceOf(Date);
    });

    it('pins the live IVR version on call arrival and keeps that snapshot after a later publish', async () => {
      const graphV1 = {
        nodes: [
          { id: 'start', type: 'start', label: 'Start', config: {} },
          {
            id: 'welcome',
            type: 'greeting',
            label: 'Welcome version one',
            config: {},
          },
          {
            id: 'menu',
            type: 'get_dtmf',
            label: 'Press 1 for the AI agent',
            config: {},
          },
          {
            id: 'ai',
            type: 'ai_agent',
            label: 'Starting the AI agent',
            config: {},
          },
          { id: 'end', type: 'end', label: 'End', config: {} },
        ],
        edges: [
          { id: 's-w', from: 'start', to: 'welcome', condition: 'default' },
          { id: 'w-m', from: 'welcome', to: 'menu', condition: 'default' },
          { id: 'm-ai', from: 'menu', to: 'ai', condition: 'dtmf:1' },
          { id: 'm-end', from: 'menu', to: 'end', condition: 'default' },
        ],
      };
      const graphV2 = {
        nodes: [
          { id: 'start', type: 'start', label: 'Start', config: {} },
          {
            id: 'welcome',
            type: 'greeting',
            label: 'Welcome version two',
            config: {},
          },
          { id: 'end', type: 'end', label: 'End', config: {} },
        ],
        edges: [
          { id: 's-e', from: 'start', to: 'welcome', condition: 'default' },
          { id: 'w-e', from: 'welcome', to: 'end', condition: 'default' },
        ],
      };
      const flow = await prisma.voiceIvrFlow.create({
        data: {
          businessId,
          name: `QA IVR live ${randomUUID()}`,
          status: 'published',
          publishedVersion: 1,
          draftGraph: graphV1,
          createdByUserId: 'test-owner',
        },
      });
      const versionOne = await prisma.voiceIvrFlowVersion.create({
        data: {
          businessId,
          flowId: flow.id,
          version: 1,
          graph: graphV1,
          changeSummary: 'Initial live route for runtime test',
          createdByUserId: 'test-owner',
        },
      });

      try {
        await baseHandleIncoming('CA-ivr-live', '+14155550137', '+15559990000');
        const arrivingCall = await prisma.phoneCall.findUniqueOrThrow({
          where: { callSid: 'CA-ivr-live' },
        });
        expect(arrivingCall.ivrFlowVersionId).toBe(versionOne.id);

        await prisma.voiceIvrFlowVersion.create({
          data: {
            businessId,
            flowId: flow.id,
            version: 2,
            graph: graphV2,
            changeSummary: 'New greeting for future calls',
            createdByUserId: 'test-owner',
          },
        });
        await prisma.voiceIvrFlow.update({
          where: { id: flow.id },
          data: { publishedVersion: 2 },
        });

        const consentResult = await service.handleRecordingConsent(
          'CA-ivr-live',
          '1',
        );
        expect(consentResult).toContain('Welcome version one');
        expect(consentResult).not.toContain('Welcome version two');
        expect(consentResult).toContain('/voice/webhook/ivr-input?nodeId=menu');

        const selectedRoute = await service.handleIvrInput(
          'CA-ivr-live',
          '1',
          'menu',
        );
        expect(selectedRoute).toContain('<Record');
        expect(selectedRoute).not.toContain('Welcome version two');
        const pinnedCall = await prisma.phoneCall.findUniqueOrThrow({
          where: { callSid: 'CA-ivr-live' },
        });
        expect(pinnedCall.ivrFlowVersionId).toBe(versionOne.id);
        expect(pinnedCall.ivrCurrentNodeId).toBeNull();
      } finally {
        await prisma.phoneCall.deleteMany({
          where: { callSid: 'CA-ivr-live' },
        });
        await prisma.voiceIvrFlow.delete({ where: { id: flow.id } });
      }
    });

    it('rechecks the published policy before honoring a consent response', async () => {
      await baseHandleIncoming(
        'CA-consent-policy-disabled',
        '+14155550135',
        '+15559990000',
      );
      await prisma.voiceCompliancePolicyPack.update({
        where: { id: inboundRecordingPackId },
        data: { disabledAt: new Date() },
      });
      try {
        const xml = await service.handleRecordingConsent(
          'CA-consent-policy-disabled',
          '1',
        );
        const call = await prisma.phoneCall.findUniqueOrThrow({
          where: { callSid: 'CA-consent-policy-disabled' },
        });
        expect(xml).not.toContain('<Record');
        expect(call.recordingConsentStatus).toBe('not_allowed');
      } finally {
        await prisma.voiceCompliancePolicyPack.update({
          where: { id: inboundRecordingPackId },
          data: { disabledAt: null },
        });
      }
    });

    it('keeps recording off when the caller declines or gives no answer', async () => {
      await baseHandleIncoming('CA-consent-no', '+14155550133', '+15559990000');
      const declined = await service.handleRecordingConsent(
        'CA-consent-no',
        '2',
      );
      expect(declined).not.toContain('<Record');
      expect(declined).toContain('You chose not to be recorded');
      expect(declined).toContain('No message was recorded');
      const declinedCall = await prisma.phoneCall.findUniqueOrThrow({
        where: { callSid: 'CA-consent-no' },
      });
      expect(declinedCall.recordingConsentStatus).toBe('declined');

      await baseHandleIncoming(
        'CA-consent-timeout',
        '+14155550134',
        '+15559990000',
      );
      const noAnswer = await service.handleRecordingConsent(
        'CA-consent-timeout',
        '',
      );
      expect(noAnswer).not.toContain('<Record');
      expect(noAnswer).toContain('No message was recorded');
      const timeoutCall = await prisma.phoneCall.findUniqueOrThrow({
        where: { callSid: 'CA-consent-timeout' },
      });
      expect(timeoutCall.recordingConsentStatus).toBe('no_response');
    });

    it('ignores a recording callback without consent before fetching or storing provider audio', async () => {
      await baseHandleIncoming(
        'CA-recording-guard',
        '+442079460019',
        '+15559990000',
      );
      const xml = await baseHandleRecording(
        'CA-recording-guard',
        'https://api.twilio.com/recordings/RE-unauthorized',
      );
      expect(xml).toContain('<Hangup/>');
      expect(mockedAxios.get.mock.calls).toHaveLength(0);
      expect(s3.upload.mock.calls).toHaveLength(0);
    });

    it('pins the currently published AI agent version to a new inbound call and uses its saved configuration', async () => {
      const agentId = randomUUID();
      const versionId = randomUUID();
      await prisma.voiceAiAgent.create({
        data: {
          id: agentId,
          businessId,
          name: 'Pinned QA Receptionist',
          template: 'receptionist',
          status: 'active',
          publishedVersionId: versionId,
          versions: {
            create: {
              id: versionId,
              businessId,
              version: 1,
              config: {
                agentName: 'Pinned Snapshot Receptionist',
                template: 'receptionist',
                purpose: 'Answer customer questions with verified records',
                voiceStyle: 'Calm and short',
                instructions: 'Use the pinned production configuration',
                escalationGuidance: 'Offer a human transfer when needed',
                languages: ['English'],
              },
              checksum: 'a'.repeat(64),
              publishedAt: new Date(),
            },
          },
        },
      });
      await service.handleIncoming(
        'CA-agent-pinned',
        '+14155550130',
        '+15559990000',
      );
      const call = await prisma.phoneCall.findUniqueOrThrow({
        where: { callSid: 'CA-agent-pinned' },
      });
      expect(call.voiceAgentVersionId).toBe(versionId);

      await prisma.voiceAiAgent.update({
        where: { id: agentId },
        data: { name: 'Renamed after call began', template: 'sales' },
      });

      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'I can help with that.', intent: 'continue' }),
      );
      await service.handleRecording(
        'CA-agent-pinned',
        'https://api.twilio.com/recordings/RE-agent-pinned',
      );
      const [, prompt, , kind] = aiInfra.complete.mock.calls[0] as [
        string,
        string,
        number,
        string,
      ];
      expect(kind).toBe('voice_entry');
      expect(prompt).toContain('Pinned Snapshot Receptionist');
      expect(prompt).toContain('template receptionist');
      expect(prompt).not.toContain('template sales');
      expect(prompt).not.toContain('Renamed after call began');
      expect(prompt).toContain('Use the pinned production configuration');
    });

    it('enforces the pinned agent tool allowlist, knowledge sources and output-token limit at runtime', async () => {
      await prisma.voiceAiAgent.updateMany({
        where: { businessId, status: 'active' },
        data: { status: 'paused' },
      });
      const knowledge = await prisma.voiceKnowledgeEntry.create({
        data: {
          businessId,
          kind: 'faq',
          title: 'Secret orchid delivery',
          content: 'The secret orchid delivery code is Orchid-413.',
        },
      });
      const agentId = randomUUID();
      const versionId = randomUUID();
      await prisma.voiceAiAgent.create({
        data: {
          id: agentId,
          businessId,
          name: 'Restricted QA Agent',
          template: 'receptionist',
          status: 'active',
          publishedVersionId: versionId,
          versions: {
            create: {
              id: versionId,
              businessId,
              version: 1,
              config: {
                agentName: 'Restricted QA Agent',
                template: 'receptionist',
                purpose: 'Answer questions safely',
                voiceStyle: 'Calm and brief',
                instructions: '',
                escalationGuidance: '',
                languages: ['English'],
                toolPermissions: [],
                knowledgeSourceIds: [],
                maxTokensPerResponse: 64,
              },
              checksum: 'b'.repeat(64),
              publishedAt: new Date(),
            },
          },
        },
      });
      await service.handleIncoming(
        'CA-agent-tools-blocked',
        '+14155550131',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'Transferring you now.', intent: 'transfer' }),
      );
      const xml = await service.handleRecording(
        'CA-agent-tools-blocked',
        'https://api.twilio.com/recordings/RE-agent-tools-blocked',
      );
      expect(xml).toContain('I can&apos;t complete that action from this call');
      expect(xml).toContain('<Record');
      expect(xml).not.toContain('<Dial');
      expect(aiInfra.complete).toHaveBeenCalledWith(
        businessId,
        expect.stringContaining('Allowed live actions: none'),
        0,
        'voice_entry',
        64,
      );
      const [, generatedPrompt] = aiInfra.complete.mock.calls[0] as [
        string,
        string,
        number,
        string,
        number,
      ];
      expect(generatedPrompt).not.toContain('Orchid-413');
      const call = await prisma.phoneCall.findUniqueOrThrow({
        where: { callSid: 'CA-agent-tools-blocked' },
      });
      await prisma.voiceAiAgent.update({
        where: { id: agentId },
        data: { status: 'paused' },
      });
      expect(call.voiceAgentVersionId).toBe(versionId);
      expect(call.outcome).toBe(PhoneCallOutcome.none);
      const transcript = call.transcript as unknown as { text: string }[];
      expect(transcript.at(-1)?.text).toContain(
        "I can't complete that action from this call",
      );
      await prisma.voiceKnowledgeEntry.delete({ where: { id: knowledge.id } });
    });
  });

  describe('handleRecording()', () => {
    it('transcribes, uploads a real S3 recording, and continues the conversation', async () => {
      await service.handleIncoming(
        'CA-continue',
        '+14155550102',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: 'What time works for you?',
          intent: 'continue',
        }),
      );

      const xml = await service.handleRecording(
        'CA-continue',
        'https://api.twilio.com/recordings/RE123',
      );
      expect(xml).toContain('What time works for you?');
      expect(xml).toContain('<Record');
      expect(s3.upload).toHaveBeenCalledTimes(1);

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-continue' },
      });
      const transcript = call?.transcript as unknown as { speaker: string }[];
      expect(transcript).toHaveLength(2);
      expect(transcript[0].speaker).toBe('caller');
      expect(transcript[1].speaker).toBe('assistant');
    });

    it('keeps the uploaded recording and queues a follow-up when speech-to-text is unavailable', async () => {
      await service.handleIncoming(
        'CA-transcription-unavailable',
        '+14155550120',
        '+15559990000',
      );
      speechToText.transcribe.mockRejectedValue(
        new AppException(
          'SPEECH_TO_TEXT_UNAVAILABLE',
          'Voice transcription is not available right now — please try again later.',
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
      );

      const xml = await service.handleRecording(
        'CA-transcription-unavailable',
        'https://api.twilio.com/recordings/RE-transcription-unavailable',
      );

      expect(xml).toContain('speech recognition is unavailable right now');
      expect(xml).toContain('<Hangup/>');
      expect(aiInfra.complete).not.toHaveBeenCalled();
      expect(s3.upload).toHaveBeenCalledTimes(1);

      const call = await prisma.phoneCall.findUniqueOrThrow({
        where: { callSid: 'CA-transcription-unavailable' },
      });
      expect(call.outcome).toBe(PhoneCallOutcome.message);
      expect(call.recordingKey).toMatch(/^voice-recordings\//);
      const transcript = call.transcript as unknown as {
        speaker: string;
        text: string;
      }[];
      expect(transcript).toHaveLength(1);
      expect(transcript[0]?.speaker).toBe('assistant');
      expect(transcript[0]?.text).toContain(
        'speech recognition is unavailable',
      );
    });

    it('books a real appointment via AppointmentsService when intent is "book" with resolvable details', async () => {
      await service.handleIncoming('CA-book', '+14155550103', '+15559990000');
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: "You're all set!",
          intent: 'book',
          service: 'Haircut',
          startsAt: '2026-09-01T10:00:00.000Z',
          customerName: 'Jordan',
        }),
      );
      // A real Appointment row (not a bare fake id) — PhoneCall.appointmentId is a real FK, so the
      // mock has to produce what the real AppointmentsService.createWalkIn would.
      const customer = await prisma.customer.create({
        data: { businessId, name: 'Jordan', phone: '+14155550103' },
      });
      const realAppointment = await prisma.appointment.create({
        data: {
          businessId,
          serviceId: serviceProductId,
          customerId: customer.id,
          startsAt: new Date('2026-09-01T10:00:00.000Z'),
          endsAt: new Date('2026-09-01T10:30:00.000Z'),
          status: 'confirmed',
          source: AppointmentSource.phone,
        },
      });
      appointments.createWalkIn.mockResolvedValue(realAppointment);

      const xml = await service.handleRecording(
        'CA-book',
        'https://api.twilio.com/recordings/RE456',
      );
      expect(xml).toContain('<Hangup/>');

      expect(appointments.createWalkIn).toHaveBeenCalledWith(
        businessId,
        expect.objectContaining({
          serviceId: serviceProductId,
          startsAt: '2026-09-01T10:00:00.000Z',
          customerPhone: '+14155550103',
        }),
        AppointmentSource.phone,
      );

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-book' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.booking);
      expect(call?.appointmentId).toBe(realAppointment.id);
    });

    it('falls back gracefully and keeps recording when the booking slot is unavailable', async () => {
      await service.handleIncoming(
        'CA-book-fail',
        '+14155550104',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: "You're all set!",
          intent: 'book',
          service: 'Haircut',
          startsAt: '2026-09-01T10:00:00.000Z',
        }),
      );
      appointments.createWalkIn.mockRejectedValue(
        new Error('Slot unavailable'),
      );

      const xml = await service.handleRecording(
        'CA-book-fail',
        'https://api.twilio.com/recordings/RE789',
      );
      expect(xml).toContain('<Record');
      expect(xml).not.toContain('<Hangup/>');

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-book-fail' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.none);
    });

    it('records outcome "message" and hangs up when the caller wants to leave a message', async () => {
      await service.handleIncoming(
        'CA-message',
        '+14155550105',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: "I'll pass that along.", intent: 'message' }),
      );

      const xml = await service.handleRecording(
        'CA-message',
        'https://api.twilio.com/recordings/RE111',
      );
      expect(xml).toContain('<Hangup/>');
      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-message' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.message);
    });

    it('dials the configured transfer number when intent is "transfer"', async () => {
      const withTransfer = new VoiceCallService(
        prisma,
        new ConfigService({
          TWILIO_ACCOUNT_SID: 'AC-test',
          TWILIO_AUTH_TOKEN: 'test-token',
          VOICE_TRANSFER_NUMBER: '+15551239999',
          BACKEND_URL: 'https://voice-test.example/api/v1',
        }),
        s3 as unknown as S3Service,
        speechToText as unknown as SpeechToTextService,
        aiInfra as unknown as AiInfraService,
        appointments as unknown as AppointmentsService,
        missedCall as unknown as MissedCallService,
        new VoiceHumanAgentDispatchService(prisma),
      );
      await withTransfer.handleIncoming(
        'CA-transfer',
        '+14155550106',
        '+15559990000',
      );
      await withTransfer.handleRecordingConsent('CA-transfer', '1');
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'Connecting you now.', intent: 'transfer' }),
      );

      const xml = await withTransfer.handleRecording(
        'CA-transfer',
        'https://api.twilio.com/recordings/RE222',
      );
      expect(xml).toContain(
        '<Dial action="https://voice-test.example/api/v1/voice/webhook/transfer-result"',
      );
      expect(xml).toContain('>+15551239999</Dial>');
      let call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-transfer' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.none);

      const resultXml = await withTransfer.handleTransferResult(
        'CA-transfer',
        'completed',
      );
      expect(resultXml).toContain('<Hangup/>');
      call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-transfer' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.transfer);
    });

    it('records a failed transfer and saves a caller message for follow-up', async () => {
      const withTransfer = new VoiceCallService(
        prisma,
        new ConfigService({
          TWILIO_ACCOUNT_SID: 'AC-test',
          TWILIO_AUTH_TOKEN: 'test-token',
          VOICE_TRANSFER_NUMBER: '+15551239999',
          BACKEND_URL: 'https://voice-test.example/api/v1',
        }),
        s3 as unknown as S3Service,
        speechToText as unknown as SpeechToTextService,
        aiInfra as unknown as AiInfraService,
        appointments as unknown as AppointmentsService,
        missedCall as unknown as MissedCallService,
        new VoiceHumanAgentDispatchService(prisma),
      );
      await withTransfer.handleIncoming(
        'CA-transfer-failed',
        '+14155550129',
        '+15559990000',
      );
      await withTransfer.handleRecordingConsent('CA-transfer-failed', '1');
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'Connecting you now.', intent: 'transfer' }),
      );
      await withTransfer.handleRecording(
        'CA-transfer-failed',
        'https://api.twilio.com/recordings/RE-transfer-failed',
      );

      const fallbackXml = await withTransfer.handleTransferResult(
        'CA-transfer-failed',
        'no-answer',
      );
      expect(fallbackXml).toContain('Please leave a message');
      expect(fallbackXml).toContain(
        'https://voice-test.example/api/v1/voice/webhook/transfer-message',
      );
      let call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-transfer-failed' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.message);

      speechToText.transcribe.mockResolvedValue('Please call me tomorrow.');
      const messageXml = await withTransfer.handleTransferMessage(
        'CA-transfer-failed',
        'https://api.twilio.com/recordings/RE-transfer-message',
      );
      expect(messageXml).toContain('Thanks, I&apos;ve saved your message');
      call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-transfer-failed' },
      });
      const transcript = call?.transcript as unknown as { text: string }[];
      expect(
        transcript.some((turn) => turn.text === 'Please call me tomorrow.'),
      ).toBe(true);
      expect(call?.outcome).toBe(PhoneCallOutcome.message);
    });

    it('ends the call with a graceful fallback when no transfer number is configured', async () => {
      await service.handleIncoming(
        'CA-no-transfer',
        '+14155550107',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'Connecting you now.', intent: 'transfer' }),
      );

      const xml = await service.handleRecording(
        'CA-no-transfer',
        'https://api.twilio.com/recordings/RE333',
      );
      expect(xml).toContain('<Hangup/>');
      expect(xml).not.toContain('<Dial>');
      // The caller was told a message was noted, so it must reach the follow-up queue — not be
      // recorded as a transfer that never happened.
      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-no-transfer' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.message);
    });

    it('never fabricates: falls back to a real "please repeat" reply when the AI response is unparseable', async () => {
      await service.handleIncoming('CA-bad-ai', '+14155550108', '+15559990000');
      aiInfra.complete.mockResolvedValue('not valid json at all');

      const xml = await service.handleRecording(
        'CA-bad-ai',
        'https://api.twilio.com/recordings/RE444',
      );
      expect(xml).toContain('having trouble understanding');
      expect(xml).toContain('<Record');
    });
  });

  describe('handleStatus()', () => {
    it('marks a call completed (not missed) on a normal hangup with no outcome yet', async () => {
      await service.handleIncoming(
        'CA-status-ok',
        '+14155550109',
        '+15559990000',
      );
      await service.handleStatus('CA-status-ok', 'completed');

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-status-ok' },
      });
      expect(call?.status).toBe('completed');
      expect(call?.endedAt).not.toBeNull();
      expect(call?.recordingExpiresAt?.getTime()).toBeGreaterThanOrEqual(
        Date.now() + 29 * 24 * 60 * 60 * 1000,
      );
      expect(call?.recordingExpiresAt?.getTime()).toBeLessThanOrEqual(
        Date.now() + 31 * 24 * 60 * 60 * 1000,
      );

      expect(missedCall.notify).not.toHaveBeenCalled();
    });

    it('marks a call missed and notifies via WhatsApp on no-answer with no outcome', async () => {
      await service.handleIncoming(
        'CA-status-missed',
        '+14155550110',
        '+15559990000',
      );
      await service.handleStatus('CA-status-missed', 'no-answer');

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-status-missed' },
      });
      expect(call?.status).toBe('missed');

      expect(missedCall.notify).toHaveBeenCalledTimes(1);
    });

    it('ignores a non-terminal status update', async () => {
      await service.handleIncoming(
        'CA-status-ringing',
        '+14155550111',
        '+15559990000',
      );
      await service.handleStatus('CA-status-ringing', 'ringing');

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-status-ringing' },
      });
      expect(call?.status).toBe('in_progress');
      expect(call?.endedAt).toBeNull();
    });
  });

  describe('Receptionist Settings depth fix — real, wired VoiceSettings (UPD-FE-051e)', () => {
    afterEach(async () => {
      await prisma.voiceSettings.deleteMany({ where: { businessId } });
    });

    it('applies a configured voiceId to every <Say> and responseTimeoutSeconds to <Record>', async () => {
      await prisma.voiceSettings.create({
        data: {
          businessId,
          voiceId: 'Polly.Joanna',
          responseTimeoutSeconds: 8,
        },
      });

      const xml = await baseHandleIncoming(
        'CA-settings-voice',
        '+14155550112',
        '+15559990000',
      );
      expect(xml).toContain('<Say voice="Polly.Joanna">');
      const consentXml = await service.handleRecordingConsent(
        'CA-settings-voice',
        '1',
      );
      expect(consentXml).toContain('timeout="8"');
    });

    it('uses the configured queueHoldMessage as the real MAX_CALL_TURNS fallback line', async () => {
      await prisma.voiceSettings.create({
        data: {
          businessId,
          queueHoldMessage: "We'll ring you back within the hour.",
        },
      });
      await service.handleIncoming(
        'CA-settings-holdmsg',
        '+14155550113',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'Sure, one more thing.', intent: 'continue' }),
      );
      // Drive the transcript past MAX_CALL_TURNS (8) by recording repeatedly — each call adds one
      // caller turn then (below the cap) one assistant turn, so the 5th call is the one whose
      // caller-turn push crosses the length>=8 check.
      for (let i = 0; i < 5; i++) {
        await service.handleRecording(
          'CA-settings-holdmsg',
          `https://api.twilio.com/recordings/RE-loop-${i}`,
        );
      }

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-settings-holdmsg' },
      });
      const transcript = call?.transcript as unknown as { text: string }[];
      expect(transcript[transcript.length - 1].text).toBe(
        "We'll ring you back within the hour.",
      );
      // A promised callback must be recorded, or it never reaches the follow-up queue.
      expect(call?.outcome).toBe(PhoneCallOutcome.message);
    });

    it('records outcome "custom" with the matched intent name when the AI matches a configured custom intent', async () => {
      await prisma.voiceSettings.create({
        data: {
          businessId,
          customIntents: [{ name: 'supplier_inquiry', priority: 5 }],
        },
      });
      await service.handleIncoming(
        'CA-settings-custom',
        '+14155550114',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: "I'll pass this to our purchasing team.",
          intent: 'supplier_inquiry',
        }),
      );

      const xml = await service.handleRecording(
        'CA-settings-custom',
        'https://api.twilio.com/recordings/RE-custom',
      );
      expect(xml).toContain('<Hangup/>');

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-settings-custom' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.custom);
      expect(call?.customIntentName).toBe('supplier_inquiry');
    });

    it('injects configured custom intents into the real classification prompt sent to the AI', async () => {
      await prisma.voiceSettings.create({
        data: {
          businessId,
          customIntents: [{ name: 'media_inquiry', priority: 3 }],
        },
      });
      await service.handleIncoming(
        'CA-settings-prompt',
        '+14155550115',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'Got it.', intent: 'continue' }),
      );

      await service.handleRecording(
        'CA-settings-prompt',
        'https://api.twilio.com/recordings/RE-prompt',
      );

      const [, prompt] = aiInfra.complete.mock.calls[0] as [string, string];
      expect(prompt).toContain('media_inquiry');
    });
  });

  describe('AI Phone, full — real records given to the AI, never fabricated', () => {
    afterEach(async () => {
      await prisma.voiceSettings.deleteMany({ where: { businessId } });
      await prisma.voiceRoutingRule.deleteMany({ where: { businessId } });
      await prisma.voiceKnowledgeEntry.deleteMany({ where: { businessId } });
    });

    it('gives the AI the real matching product/service price and stock, and records it as a source', async () => {
      speechToText.transcribe.mockResolvedValue('How much is a haircut?');
      await service.handleIncoming(
        'CA-catalog',
        '+14155550120',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: 'A haircut is 25.',
          intent: 'continue',
          topic: 'service_pricing',
          answered: true,
        }),
      );

      await service.handleRecording(
        'CA-catalog',
        'https://api.twilio.com/recordings/RE-catalog',
      );

      const [, prompt] = aiInfra.complete.mock.calls[0] as [string, string];
      expect(prompt).toContain('Service "Haircut": price 25');

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-catalog' },
      });
      const transcript = call?.transcript as unknown as {
        speaker: string;
        analysis?: { sources: string[] };
      }[];
      const assistantTurn = transcript.find((t) => t.speaker === 'assistant');
      expect(assistantTurn?.analysis?.sources).toContain('Products: Haircut');
    });

    it('does not offer catalog context at all when shareCatalog is off', async () => {
      await prisma.voiceSettings.create({
        data: { businessId, shareCatalog: false },
      });
      speechToText.transcribe.mockResolvedValue('How much is a haircut?');
      await service.handleIncoming(
        'CA-catalog-off',
        '+14155550121',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: "I don't have that.", intent: 'continue' }),
      );

      await service.handleRecording(
        'CA-catalog-off',
        'https://api.twilio.com/recordings/RE-catalog-off',
      );
      const [, prompt] = aiInfra.complete.mock.calls[0] as [string, string];
      expect(prompt).not.toContain('Service "Haircut"');
    });

    it('gives the AI the real saved hours and address when a caller asks, and records them as sources', async () => {
      await prisma.business.update({
        where: { id: businessId },
        data: {
          address: '12 Main Boulevard, Lahore',
          workingHours: {
            mon: [['09:00', '17:00']],
            tue: [['09:00', '17:00']],
          },
        },
      });
      try {
        speechToText.transcribe.mockResolvedValue(
          'What time do you open and where are you?',
        );
        await service.handleIncoming(
          'CA-hours',
          '+14155550129',
          '+15559990000',
        );
        aiInfra.complete.mockResolvedValue(
          JSON.stringify({
            reply: 'We open at nine.',
            intent: 'continue',
            topic: 'opening_hours',
            answered: true,
          }),
        );
        await service.handleRecording(
          'CA-hours',
          'https://api.twilio.com/recordings/RE-hours',
        );

        const [, prompt] = aiInfra.complete.mock.calls[0] as [string, string];
        expect(prompt).toContain('mon 09:00-17:00');
        expect(prompt).toContain('12 Main Boulevard, Lahore');

        const call = await prisma.phoneCall.findUnique({
          where: { callSid: 'CA-hours' },
        });
        const transcript = call?.transcript as unknown as {
          speaker: string;
          analysis?: { sources: string[] };
        }[];
        expect(
          transcript.find((t) => t.speaker === 'assistant')?.analysis?.sources,
        ).toEqual(expect.arrayContaining(['Business hours', 'Address']));
      } finally {
        await prisma.business.update({
          where: { id: businessId },
          data: { address: null, workingHours: {} },
        });
      }
    });

    it('does not give the AI hours or address when catalogue sharing is off', async () => {
      await prisma.voiceSettings.create({
        data: { businessId, shareCatalog: false },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: {
          address: '12 Main Boulevard, Lahore',
          workingHours: { mon: [['09:00', '17:00']] },
        },
      });
      try {
        speechToText.transcribe.mockResolvedValue('What time do you open?');
        await service.handleIncoming(
          'CA-hours-off',
          '+14155550130',
          '+15559990000',
        );
        aiInfra.complete.mockResolvedValue(
          JSON.stringify({
            reply: "I don't have that.",
            intent: 'continue',
            topic: 'opening_hours',
            answered: false,
          }),
        );
        await service.handleRecording(
          'CA-hours-off',
          'https://api.twilio.com/recordings/RE-hours-off',
        );
        const [, prompt] = aiInfra.complete.mock.calls[0] as [string, string];
        expect(prompt).not.toContain('09:00-17:00');
        expect(prompt).not.toContain('Main Boulevard');
      } finally {
        await prisma.business.update({
          where: { id: businessId },
          data: { address: null, workingHours: {} },
        });
      }
    });

    it('only shares a verified caller’s own order status when shareOrderStatus is on and the number matches a saved customer', async () => {
      await prisma.voiceSettings.create({
        data: { businessId, shareOrderStatus: true },
      });
      const customer = await prisma.customer.create({
        data: { businessId, name: 'Order Caller', phone: '+14155550122' },
      });
      const order = await prisma.order.create({
        data: {
          businessId,
          orderNo: 9001,
          customerId: customer.id,
          status: 'confirmed',
          total: 40,
        },
      });
      speechToText.transcribe.mockResolvedValue(
        'What is the status of my order?',
      );
      await service.handleIncoming('CA-order', '+14155550122', '+15559990000');
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: `Order ${order.orderNo} is confirmed.`,
          intent: 'continue',
          topic: 'order_status',
          answered: true,
        }),
      );

      await service.handleRecording(
        'CA-order',
        'https://api.twilio.com/recordings/RE-order',
      );
      const [, prompt] = aiInfra.complete.mock.calls[0] as [string, string];
      expect(prompt).toContain(`#${order.orderNo}`);
      expect(prompt).toContain('confirmed');

      await prisma.order.delete({ where: { id: order.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
    });

    it('never shares order status for an unverified caller (no matching saved customer), even with sharing on', async () => {
      await prisma.voiceSettings.create({
        data: { businessId, shareOrderStatus: true },
      });
      speechToText.transcribe.mockResolvedValue(
        'What is the status of my order?',
      );
      await service.handleIncoming(
        'CA-order-unverified',
        '+14155550123',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: "I don't have that.", intent: 'continue' }),
      );

      await service.handleRecording(
        'CA-order-unverified',
        'https://api.twilio.com/recordings/RE-order-unverified',
      );
      const [, prompt] = aiInfra.complete.mock.calls[0] as [string, string];
      expect(prompt).not.toContain('most recent order');
    });

    it('gives the AI a real matching FAQ entry and bumps its real usage stats', async () => {
      const entry = await prisma.voiceKnowledgeEntry.create({
        data: {
          businessId,
          kind: 'faq',
          title: 'Eid hours',
          question: 'Are you open on Eid?',
          content: 'We are closed on both days of Eid al-Fitr.',
        },
      });
      speechToText.transcribe.mockResolvedValue('Are you open on Eid?');
      await service.handleIncoming(
        'CA-knowledge',
        '+14155550124',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: 'We are closed for Eid.',
          intent: 'continue',
          topic: 'opening_hours',
          answered: true,
        }),
      );

      await service.handleRecording(
        'CA-knowledge',
        'https://api.twilio.com/recordings/RE-knowledge',
      );
      const [, prompt] = aiInfra.complete.mock.calls[0] as [string, string];
      expect(prompt).toContain('closed on both days of Eid');

      const updated = await prisma.voiceKnowledgeEntry.findUniqueOrThrow({
        where: { id: entry.id },
      });
      expect(updated.usedCount).toBe(1);
      expect(updated.lastUsedAt).not.toBeNull();
    });

    it('extracts and keeps a caller name and email the AI clearly reports, without overwriting a real value already saved', async () => {
      speechToText.transcribe.mockResolvedValue(
        'My name is Ayesha Khan, email ayesha@example.com',
      );
      await service.handleIncoming(
        'CA-identity',
        '+14155550125',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: 'Thanks, Ayesha.',
          intent: 'continue',
          customerName: 'Ayesha Khan',
          callerEmail: 'ayesha@example.com',
        }),
      );
      await service.handleRecording(
        'CA-identity',
        'https://api.twilio.com/recordings/RE-identity-1',
      );

      let call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-identity' },
      });
      expect(call?.callerName).toBe('Ayesha Khan');
      expect(call?.callerEmail).toBe('ayesha@example.com');

      // A later turn "correcting" the name must not clobber the one already on file.
      speechToText.transcribe.mockResolvedValue('Actually never mind');
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: 'Sure.',
          intent: 'continue',
          customerName: 'Someone Else',
        }),
      );
      await service.handleRecording(
        'CA-identity',
        'https://api.twilio.com/recordings/RE-identity-2',
      );
      call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-identity' },
      });
      expect(call?.callerName).toBe('Ayesha Khan');
    });

    it('overrides the AI’s own intent with a matching keyword routing rule, transferring to the rule’s own number', async () => {
      await prisma.voiceRoutingRule.create({
        data: {
          businessId,
          position: 1,
          name: 'Legal escalation',
          triggerKind: 'keyword',
          matchValue: 'lawyer',
          action: 'transfer',
          transferNumber: '+15557778888',
        },
      });
      speechToText.transcribe.mockResolvedValue(
        'I want to talk to a lawyer about this.',
      );
      await service.handleIncoming(
        'CA-rule-transfer',
        '+14155550126',
        '+15559990000',
      );
      // The AI itself thinks this is just "continue" — the rule must still win.
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'Let me note that.', intent: 'continue' }),
      );

      const xml = await service.handleRecording(
        'CA-rule-transfer',
        'https://api.twilio.com/recordings/RE-rule-transfer',
      );
      expect(xml).toContain('>+15557778888</Dial>');

      let call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-rule-transfer' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.none);
      await service.handleTransferResult('CA-rule-transfer', 'completed');
      call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-rule-transfer' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.transfer);
      expect(call?.routedRuleName).toBe('Legal escalation');
    });

    it('overrides the AI’s own intent with a matching low_confidence routing rule, taking a message', async () => {
      await prisma.voiceRoutingRule.create({
        data: {
          businessId,
          position: 1,
          name: 'Low confidence safety net',
          triggerKind: 'low_confidence',
          action: 'take_message',
        },
      });
      speechToText.transcribe.mockResolvedValue('Something unclear.');
      await service.handleIncoming(
        'CA-rule-lowconf',
        '+14155550127',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({
          reply: 'I think I follow.',
          intent: 'continue',
          confidence: 'low',
        }),
      );

      const xml = await service.handleRecording(
        'CA-rule-lowconf',
        'https://api.twilio.com/recordings/RE-rule-lowconf',
      );
      expect(xml).toContain('<Hangup/>');
      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-rule-lowconf' },
      });
      expect(call?.outcome).toBe(PhoneCallOutcome.message);
      expect(call?.routedRuleName).toBe('Low confidence safety net');
    });

    it('does not apply an inactive routing rule', async () => {
      await prisma.voiceRoutingRule.create({
        data: {
          businessId,
          position: 1,
          name: 'Disabled rule',
          triggerKind: 'keyword',
          matchValue: 'lawyer',
          action: 'transfer',
          transferNumber: '+15557778888',
          active: false,
        },
      });
      speechToText.transcribe.mockResolvedValue('I want a lawyer.');
      await service.handleIncoming(
        'CA-rule-inactive',
        '+14155550128',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'Continuing.', intent: 'continue' }),
      );

      const xml = await service.handleRecording(
        'CA-rule-inactive',
        'https://api.twilio.com/recordings/RE-rule-inactive',
      );
      expect(xml).not.toContain('<Dial>');
      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-rule-inactive' },
      });
      expect(call?.routedRuleName).toBeNull();
    });

    it('routes an AI transfer to a fresh available human profile and releases its capacity from provider callbacks', async () => {
      await prisma.voiceRoutingRule.deleteMany({ where: { businessId } });
      const staff = await prisma.user.create({
        data: {
          email: `voice-human-transfer-${randomUUID()}@example.com`,
          passwordHash: 'test-only',
          name: 'Available Call Agent',
          phone: '+15550004444',
        },
      });
      const member = await prisma.businessUser.create({
        data: { businessId, userId: staff.id, role: Role.staff },
      });
      await prisma.voiceHumanAgentProfile.create({
        data: {
          businessId,
          staffUserId: member.id,
          maxConcurrentCalls: 1,
          active: true,
          presenceStatus: VoiceAgentPresenceStatus.available,
          lastHeartbeatAt: new Date(),
        },
      });

      try {
        mockedAxios.post.mockResolvedValue({
          data: {
            call_sid: 'CA-human-agent-1',
            conference_sid: 'CF-human-transfer',
          },
        });
        await service.handleIncoming(
          'CA-human-transfer',
          '+14155550130',
          '+15559990000',
        );
        aiInfra.complete.mockResolvedValue(
          JSON.stringify({ reply: 'Connecting you now.', intent: 'transfer' }),
        );

        const xml = await service.handleRecording(
          'CA-human-transfer',
          'https://api.twilio.com/recordings/RE-human-transfer',
        );
        expect(xml).toContain('<Conference');
        expect(xml).toContain('>CA-human-transfer</Conference>');

        const call = await prisma.phoneCall.findUniqueOrThrow({
          where: { callSid: 'CA-human-transfer' },
        });
        const assignment =
          await prisma.voiceHumanAgentAssignment.findFirstOrThrow({
            where: { callId: call.id, attemptNumber: 1 },
          });
        expect(assignment.staffUserId).toBe(member.id);
        expect(assignment.status).toBe('offered');
        expect(assignment.providerCallSid).toBe('CA-human-agent-1');
        expect(assignment.conferenceSid).toBe('CF-human-transfer');

        await service.handleDialStatus(
          'CA-human-transfer',
          'in-progress',
          1,
          'CA-human-agent-1',
        );
        const connected =
          await prisma.voiceHumanAgentAssignment.findFirstOrThrow({
            where: { callId: call.id, attemptNumber: 1 },
          });
        expect(connected.status).toBe('connected');
        expect(connected.connected).toBe(true);

        await service.handleDialStatus(
          'CA-human-transfer',
          'completed',
          1,
          'CA-human-agent-1',
        );
        const released =
          await prisma.voiceHumanAgentAssignment.findFirstOrThrow({
            where: { callId: call.id, attemptNumber: 1 },
          });
        expect(released.status).toBe('released');
        expect(released.providerStatus).toBe('completed');
      } finally {
        await prisma.phoneCall.deleteMany({
          where: { callSid: 'CA-human-transfer' },
        });
        await prisma.voiceHumanAgentProfile.deleteMany({
          where: { businessId, staffUserId: member.id },
        });
        await prisma.businessUser.delete({ where: { id: member.id } });
        await prisma.user.delete({ where: { id: staff.id } });
      }
    });

    it('tries the next eligible human after a failed dial, then uses the fallback when exhausted', async () => {
      await prisma.voiceRoutingRule.deleteMany({ where: { businessId } });
      const staffUsers: string[] = [];
      const profileIds: string[] = [];
      for (const [index, phone] of ['+15550004445', '+15550004446'].entries()) {
        const staff = await prisma.user.create({
          data: {
            email: `voice-human-retry-${index}-${randomUUID()}@example.com`,
            passwordHash: 'test-only',
            name: `Retry Agent ${index + 1}`,
            phone,
          },
        });
        const member = await prisma.businessUser.create({
          data: { businessId, userId: staff.id, role: Role.staff },
        });
        staffUsers.push(staff.id);
        const profile = await prisma.voiceHumanAgentProfile.create({
          data: {
            businessId,
            staffUserId: member.id,
            active: true,
            presenceStatus: VoiceAgentPresenceStatus.available,
            lastHeartbeatAt: new Date(),
          },
        });
        profileIds.push(profile.id);
      }

      try {
        mockedAxios.post.mockResolvedValue({
          data: {
            call_sid: 'CA-human-agent-leg',
            conference_sid: 'CF-human-retry',
          },
        });
        await service.handleIncoming(
          'CA-human-retry',
          '+14155550131',
          '+15559990000',
        );
        aiInfra.complete.mockResolvedValue(
          JSON.stringify({ reply: 'Connecting you now.', intent: 'transfer' }),
        );
        const firstDial = await service.handleRecording(
          'CA-human-retry',
          'https://api.twilio.com/recordings/RE-human-retry',
        );
        expect(firstDial).toContain('<Conference');

        const firstAssignment =
          await prisma.voiceHumanAgentAssignment.findFirstOrThrow({
            where: { call: { callSid: 'CA-human-retry' }, attemptNumber: 1 },
          });
        await service.handleDialStatus(
          'CA-human-retry',
          'no-answer',
          1,
          'CA-human-agent-leg',
        );
        const secondAssignment =
          await prisma.voiceHumanAgentAssignment.findFirstOrThrow({
            where: { call: { callSid: 'CA-human-retry' }, attemptNumber: 2 },
          });
        expect(secondAssignment.profileId).not.toBe(firstAssignment.profileId);

        await service.handleDialStatus(
          'CA-human-retry',
          'no-answer',
          1,
          'CA-human-agent-leg',
        );
        const rows = await prisma.voiceHumanAgentAssignment.findMany({
          where: { call: { callSid: 'CA-human-retry' } },
          orderBy: { attemptNumber: 'asc' },
        });
        expect(rows.map((row) => row.attemptNumber)).toEqual([1, 2]);
        expect(new Set(rows.map((row) => row.profileId)).size).toBe(2);

        await service.handleDialStatus(
          'CA-human-retry',
          'no-answer',
          2,
          'CA-human-agent-leg',
        );
        const call = await prisma.phoneCall.findUniqueOrThrow({
          where: { callSid: 'CA-human-retry' },
        });
        expect(call.outcome).toBe(PhoneCallOutcome.message);
        expect(profileIds).toContain(rows[0].profileId);
        expect(profileIds).toContain(rows[1].profileId);
      } finally {
        await prisma.phoneCall.deleteMany({
          where: { callSid: 'CA-human-retry' },
        });
        await prisma.voiceHumanAgentProfile.deleteMany({
          where: { id: { in: profileIds } },
        });
        const members = await prisma.businessUser.findMany({
          where: { businessId, userId: { in: staffUsers } },
          select: { id: true },
        });
        await prisma.businessUser.deleteMany({
          where: { id: { in: members.map((member) => member.id) } },
        });
        await prisma.user.deleteMany({ where: { id: { in: staffUsers } } });
      }
    });
  });
});
