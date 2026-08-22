import { MessageWorkerProcessor } from './message-worker.processor';
import { TemplateRegistryService } from './templates/template-registry.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { WhatsappService } from '../whatsapp/whatsapp.service';
import type { SmsService } from './channels/sms.service';
import type { EmailService } from './channels/email.service';
import type { TerminologyService } from '../settings/terminology.service';
import type { Job } from 'bullmq';

describe('MessageWorkerProcessor (UPD-BE-092 fix-it — custom message text)', () => {
  const baseMessage: {
    id: string;
    businessId: string;
    customerId: string;
    channel: 'sms' | 'whatsapp' | 'email';
    category: 'utility' | 'marketing';
    templateKey: string;
    locale: string;
    payload: Record<string, string>;
    status: 'queued';
    providerRef: string | null;
    customBody: string | null;
  } = {
    id: 'msg-1',
    businessId: 'biz-1',
    customerId: 'cust-1',
    channel: 'sms',
    category: 'utility',
    templateKey: 'booking_reminder',
    locale: 'en',
    payload: {
      customerName: 'Ivy',
      serviceName: 'Haircut',
      dateTime: '2026-09-01T10:00:00Z',
      __to: '+15551234567',
    },
    status: 'queued',
    providerRef: null,
    customBody: null,
  };

  function buildProcessor(messageOverrides: Partial<typeof baseMessage>) {
    const message = { ...baseMessage, ...messageOverrides };
    const prisma = {
      message: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(message),
        update: jest.fn().mockResolvedValue(message),
      },
    };
    const templates = new TemplateRegistryService();
    const sms = {
      send: jest.fn().mockResolvedValue({ providerRef: 'sms-ref' }),
    };
    const whatsapp = {
      send: jest.fn().mockResolvedValue({ providerRef: 'wa-ref' }),
    };
    const email = {
      send: jest.fn().mockResolvedValue({ providerRef: 'email-ref' }),
    };
    const terminology = {
      applyToText: jest.fn((_biz: string, text: string) =>
        Promise.resolve(text),
      ),
    };

    const processor = new MessageWorkerProcessor(
      prisma as unknown as PrismaService,
      templates,
      whatsapp as unknown as WhatsappService,
      sms as unknown as SmsService,
      email as unknown as EmailService,
      terminology as unknown as TerminologyService,
    );
    return { processor, prisma, sms, whatsapp, email };
  }

  it('uses the fixed registry template when no customBody is set', async () => {
    const { processor, sms } = buildProcessor({});
    await processor.process({ data: { messageId: 'msg-1' } } as Job<{
      messageId: string;
    }>);

    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Reminder: Ivy, your Haircut appointment is at 2026-09-01T10:00:00Z.',
      }),
    );
  });

  it('sends the real custom message text, with variables substituted, when customBody is set', async () => {
    const { processor, sms } = buildProcessor({
      customBody:
        'Hi {{customerName}}! See you for {{serviceName}} at {{dateTime}}.',
    });
    await processor.process({ data: { messageId: 'msg-1' } } as Job<{
      messageId: string;
    }>);

    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hi Ivy! See you for Haircut at 2026-09-01T10:00:00Z.',
      }),
    );
  });

  it('passes the real custom text through to WhatsApp too — the adapter itself decides whether to honour it based on the 24h window', async () => {
    const { processor, whatsapp } = buildProcessor({
      channel: 'whatsapp',
      customBody: 'Custom WhatsApp text for {{customerName}}.',
    });

    await processor.process({ data: { messageId: 'msg-1' } } as Job<{
      messageId: string;
    }>);

    expect(whatsapp.send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Custom WhatsApp text for Ivy.',
        templateKey: 'booking_reminder',
      }),
    );
  });
});
