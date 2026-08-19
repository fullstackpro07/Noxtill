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
    await prisma.business.delete({ where: { id: businessId } });
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
});
