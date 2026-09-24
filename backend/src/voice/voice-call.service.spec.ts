import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { SpeechToTextService } from '../ai/speech-to-text.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppointmentsService } from '../bookings/appointments.service';
import { MissedCallService } from './missed-call.service';
import { VoiceCallService } from './voice-call.service';
import { CALL_DISCLOSURE_TEXT } from './voice.constants';
import { AppointmentSource, PhoneCallOutcome } from '@prisma/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VoiceCallService (UPD-BE-057/058/059)', () => {
  let prisma: PrismaService;
  let service: VoiceCallService;
  let businessId: string;
  let serviceProductId: string;
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
    });
    service = new VoiceCallService(
      prisma,
      config,
      s3 as unknown as S3Service,
      speechToText as unknown as SpeechToTextService,
      aiInfra as unknown as AiInfraService,
      appointments as unknown as AppointmentsService,
      missedCall as unknown as MissedCallService,
    );
  });

  beforeEach(() => {
    mockedAxios.get.mockResolvedValue({ data: new ArrayBuffer(8) });
    s3.upload.mockResolvedValue(undefined);
    speechToText.transcribe.mockResolvedValue('I would like a haircut');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
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
    it('rejects a call to an unrecognized number without creating a PhoneCall row', async () => {
      const xml = await service.handleIncoming(
        'CA-unknown-number',
        '+15550000001',
        '+19990000000',
      );
      expect(xml).toContain('<Hangup/>');
      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-unknown-number' },
      });
      expect(call).toBeNull();
    });

    it('speaks the mandatory disclosure and starts recording for a real business number', async () => {
      const xml = await service.handleIncoming(
        'CA-real-1',
        '+15550000001',
        '+15559990000',
      );
      expect(xml).toContain(CALL_DISCLOSURE_TEXT);
      expect(xml).toContain('<Record');

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-real-1' },
      });
      expect(call?.businessId).toBe(businessId);
      expect(call?.status).toBe('in_progress');
    });
  });

  describe('handleRecording()', () => {
    it('transcribes, uploads a real S3 recording, and continues the conversation', async () => {
      await service.handleIncoming(
        'CA-continue',
        '+15550000002',
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

    it('books a real appointment via AppointmentsService when intent is "book" with resolvable details', async () => {
      await service.handleIncoming('CA-book', '+15550000003', '+15559990000');
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
        data: { businessId, name: 'Jordan', phone: '+15550000003' },
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
          customerPhone: '+15550000003',
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
        '+15550000004',
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
        '+15550000005',
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
        }),
        s3 as unknown as S3Service,
        speechToText as unknown as SpeechToTextService,
        aiInfra as unknown as AiInfraService,
        appointments as unknown as AppointmentsService,
        missedCall as unknown as MissedCallService,
      );
      await withTransfer.handleIncoming(
        'CA-transfer',
        '+15550000006',
        '+15559990000',
      );
      aiInfra.complete.mockResolvedValue(
        JSON.stringify({ reply: 'Connecting you now.', intent: 'transfer' }),
      );

      const xml = await withTransfer.handleRecording(
        'CA-transfer',
        'https://api.twilio.com/recordings/RE222',
      );
      expect(xml).toContain('<Dial>+15551239999</Dial>');
    });

    it('ends the call with a graceful fallback when no transfer number is configured', async () => {
      await service.handleIncoming(
        'CA-no-transfer',
        '+15550000007',
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
      await service.handleIncoming('CA-bad-ai', '+15550000008', '+15559990000');
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
        '+15550000009',
        '+15559990000',
      );
      await service.handleStatus('CA-status-ok', 'completed');

      const call = await prisma.phoneCall.findUnique({
        where: { callSid: 'CA-status-ok' },
      });
      expect(call?.status).toBe('completed');
      expect(call?.endedAt).not.toBeNull();

      expect(missedCall.notify).not.toHaveBeenCalled();
    });

    it('marks a call missed and notifies via WhatsApp on no-answer with no outcome', async () => {
      await service.handleIncoming(
        'CA-status-missed',
        '+15550000010',
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
        '+15550000011',
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

      const xml = await service.handleIncoming(
        'CA-settings-voice',
        '+15550000012',
        '+15559990000',
      );
      expect(xml).toContain('<Say voice="Polly.Joanna">');
      expect(xml).toContain('timeout="8"');
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
        '+15550000013',
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
        '+15550000014',
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
        '+15550000015',
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
        '+15550000020',
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
        '+15550000021',
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
          '+15550000029',
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
          '+15550000030',
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
        data: { businessId, name: 'Order Caller', phone: '+15550000022' },
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
      await service.handleIncoming('CA-order', '+15550000022', '+15559990000');
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
        '+15550000023',
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
        '+15550000024',
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
        '+15550000025',
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
        '+15550000026',
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
      expect(xml).toContain('<Dial>+15557778888</Dial>');

      const call = await prisma.phoneCall.findUnique({
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
        '+15550000027',
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
        '+15550000028',
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
  });
});
