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
    payload: Record<string, string | boolean>;
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
    const transactionClient = {
      message: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: {
        create: jest
          .fn<
            Promise<void>,
            [
              {
                data: {
                  action: string;
                  entityId: string;
                  after: Record<string, unknown>;
                };
              },
            ]
          >()
          .mockResolvedValue(undefined),
      },
    };
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: message.customerId,
          phone: '+15551234567',
          consentMarketing: true,
          optedOut: false,
        }),
      },
      customerChannelConsent: {
        findFirst: jest.fn().mockResolvedValue({ state: 'granted' }),
      },
      message: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(message),
        update: jest.fn().mockResolvedValue(message),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(transactionClient),
      ),
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
    // Real default term resolution (no business override in play here) rather than a bare
    // passthrough — booking_reminder now genuinely contains a real {{term:appointment}}
    // placeholder (Terminology Engine, UPD-INT-016), so a passthrough would leave it unresolved.
    const terminology = {
      applyToText: jest.fn((_biz: string, text: string) =>
        Promise.resolve(text.replace(/\{\{term:(?:\w+\.)?(\w+)\}\}/g, '$1')),
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
    return { processor, prisma, sms, whatsapp, email, transactionClient };
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

  it('suppresses a queued marketing message when consent was revoked before the worker ran', async () => {
    const { processor, prisma, sms, transactionClient } = buildProcessor({
      category: 'marketing',
      templateKey: 'campaign',
      payload: { body: 'A reviewed follow-up.', __to: '+15551234567' },
    });
    prisma.customer.findFirst.mockResolvedValueOnce({
      id: 'cust-1',
      phone: '+15551234567',
      consentMarketing: false,
      optedOut: false,
    });

    await processor.process({ data: { messageId: 'msg-1' } } as Job<{
      messageId: string;
    }>);

    expect(sms.send).not.toHaveBeenCalled();
    expect(transactionClient.message.updateMany).toHaveBeenCalledWith({
      where: { id: 'msg-1', businessId: 'biz-1', status: 'queued' },
      data: { status: 'failed' },
    });
    const auditInput = transactionClient.auditLog.create.mock.calls[0][0];
    expect(auditInput.data.action).toBe('messaging.marketing_send_suppressed');
    expect(auditInput.data.entityId).toBe('msg-1');
    expect(auditInput.data.after.reason).toBe('marketing_consent_missing');
  });

  it('suppresses a queued marketing message when the customer opted out before delivery', async () => {
    const { processor, prisma, sms, transactionClient } = buildProcessor({
      category: 'marketing',
      templateKey: 'campaign',
    });
    prisma.customer.findFirst.mockResolvedValueOnce({
      id: 'cust-1',
      phone: '+15551234567',
      consentMarketing: true,
      optedOut: true,
    });

    await processor.process({ data: { messageId: 'msg-1' } } as Job<{
      messageId: string;
    }>);

    expect(sms.send).not.toHaveBeenCalled();
    const auditInput = transactionClient.auditLog.create.mock.calls[0][0];
    expect(auditInput.data.after.reason).toBe('customer_opted_out');
  });

  it('suppresses an agent message when the latest channel-specific consent is revoked', async () => {
    const { processor, prisma, sms, transactionClient } = buildProcessor({
      category: 'marketing',
      templateKey: 'campaign',
      payload: { __to: '+15551234567', __channelConsentRequired: true },
    });
    prisma.customerChannelConsent.findFirst.mockResolvedValueOnce({
      state: 'revoked',
    });

    await processor.process({ data: { messageId: 'msg-1' } } as Job<{
      messageId: string;
    }>);

    expect(prisma.customerChannelConsent.findFirst).toHaveBeenCalledWith({
      where: { businessId: 'biz-1', customerId: 'cust-1', channel: 'sms' },
      orderBy: { revision: 'desc' },
      select: { state: true },
    });
    expect(sms.send).not.toHaveBeenCalled();
    const auditInput = transactionClient.auditLog.create.mock.calls[0][0];
    expect(auditInput.data.after.reason).toBe(
      'channel_specific_consent_missing',
    );
  });

  it('suppresses a legacy queued marketing message with no channel grant even without the newer marker', async () => {
    const { processor, prisma, sms, transactionClient } = buildProcessor({
      category: 'marketing',
      templateKey: 'campaign',
      payload: { body: 'A reviewed follow-up.', __to: '+15551234567' },
    });
    prisma.customerChannelConsent.findFirst.mockResolvedValueOnce(null);

    await processor.process({ data: { messageId: 'msg-1' } } as Job<{
      messageId: string;
    }>);

    expect(sms.send).not.toHaveBeenCalled();
    const auditInput = transactionClient.auditLog.create.mock.calls[0][0];
    expect(auditInput.data.after.reason).toBe(
      'channel_specific_consent_missing',
    );
  });

  it('allows a Customer Agent marketing message only while its channel grant remains current', async () => {
    const { processor, prisma, sms } = buildProcessor({
      category: 'marketing',
      templateKey: 'campaign',
      payload: { __to: '+15551234567', __channelConsentRequired: true },
    });

    await processor.process({ data: { messageId: 'msg-1' } } as Job<{
      messageId: string;
    }>);

    expect(prisma.customerChannelConsent.findFirst).toHaveBeenCalledTimes(1);
    expect(sms.send).toHaveBeenCalledTimes(1);
  });
});
