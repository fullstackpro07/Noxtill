import { Job } from 'bullmq';
import {
  Message,
  MessageCategory,
  MessageChannel,
  MessageStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappWindowService } from '../whatsapp/whatsapp-window.service';
import { WebhookEventsProcessor } from './webhook-events.processor';

describe('WebhookEventsProcessor (MySQL)', () => {
  let prisma: PrismaService;
  let processor: WebhookEventsProcessor;
  let businessId: string;
  let otherBusinessId: string;
  let sequence = 0;
  const refreshWhatsappWindow = jest.fn();

  async function createMessage(
    channel: MessageChannel,
    status: MessageStatus,
    providerRef: string,
    options: {
      businessId?: string;
      customerId?: string;
      recipient?: string;
    } = {},
  ): Promise<Message> {
    return prisma.message.create({
      data: {
        businessId: options.businessId ?? businessId,
        customerId: options.customerId,
        channel,
        category: MessageCategory.utility,
        templateKey: 'customer_agent_follow_up',
        payload: { to: options.recipient ?? '+15550000000' },
        status,
        providerRef,
      },
    });
  }

  async function runJob(name: string, data: Record<string, unknown>) {
    await processor.process({ name, data } as Job);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = `${Date.now()}-${process.pid}`;
    const business = await prisma.business.create({
      data: {
        name: 'Webhook Delivery State Test',
        slug: `webhook-delivery-state-${stamp}`,
      },
    });
    businessId = business.id;
    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Webhook Delivery State Other Test',
        slug: `webhook-delivery-state-other-${stamp}`,
      },
    });
    otherBusinessId = otherBusiness.id;
    processor = new WebhookEventsProcessor(prisma, {
      refresh: refreshWhatsappWindow,
    } as unknown as WhatsappWindowService);
  });

  beforeEach(() => {
    refreshWhatsappWindow.mockClear();
  });

  afterAll(async () => {
    const businessIds = [businessId, otherBusinessId].filter(Boolean);
    if (businessIds.length) {
      await prisma.message.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.customer.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.business.deleteMany({
        where: { id: { in: businessIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('does not let a delayed sent callback regress confirmed delivery', async () => {
    const providerRef = `twilio-${businessId}-${sequence++}`;
    const message = await createMessage(
      MessageChannel.sms,
      MessageStatus.sent,
      providerRef,
    );

    await runJob('twilio-status', {
      MessageSid: providerRef,
      MessageStatus: 'delivered',
    });
    await runJob('twilio-status', {
      MessageSid: providerRef,
      MessageStatus: 'sent',
    });

    await expect(
      prisma.message.findUniqueOrThrow({ where: { id: message.id } }),
    ).resolves.toMatchObject({ status: MessageStatus.delivered });
  });

  it('does not let a delayed failure regress a confirmed delivery or read', async () => {
    const deliveredRef = `meta-delivered-${businessId}-${sequence++}`;
    const readRef = `meta-read-${businessId}-${sequence++}`;
    const [delivered, read] = await Promise.all([
      createMessage(
        MessageChannel.whatsapp,
        MessageStatus.delivered,
        deliveredRef,
      ),
      createMessage(MessageChannel.whatsapp, MessageStatus.read, readRef),
    ]);

    await runJob('meta-status', { id: deliveredRef, status: 'failed' });
    await runJob('meta-status', { id: readRef, status: 'delivered' });

    const [deliveredAfter, readAfter] = await Promise.all([
      prisma.message.findUniqueOrThrow({ where: { id: delivered.id } }),
      prisma.message.findUniqueOrThrow({ where: { id: read.id } }),
    ]);
    expect(deliveredAfter.status).toBe(MessageStatus.delivered);
    expect(readAfter.status).toBe(MessageStatus.read);
  });

  it('scopes provider references to their messaging channel', async () => {
    const providerRef = `shared-reference-${businessId}-${sequence++}`;
    const [sms, email] = await Promise.all([
      createMessage(MessageChannel.sms, MessageStatus.queued, providerRef),
      createMessage(MessageChannel.email, MessageStatus.queued, providerRef),
    ]);

    await runJob('twilio-status', {
      MessageSid: providerRef,
      MessageStatus: 'delivered',
    });

    const [smsAfter, emailAfter] = await Promise.all([
      prisma.message.findUniqueOrThrow({ where: { id: sms.id } }),
      prisma.message.findUniqueOrThrow({ where: { id: email.id } }),
    ]);
    expect(smsAfter.status).toBe(MessageStatus.delivered);
    expect(emailAfter.status).toBe(MessageStatus.queued);
  });

  it('requires a recognized Telnyx channel before applying its status', async () => {
    const providerRef = `telnyx-${businessId}-${sequence++}`;
    const [sms, whatsapp] = await Promise.all([
      createMessage(MessageChannel.sms, MessageStatus.queued, providerRef),
      createMessage(MessageChannel.whatsapp, MessageStatus.queued, providerRef),
    ]);

    await runJob('telnyx-status', {
      messageId: providerRef,
      status: 'delivered',
      hasErrors: false,
      type: 'SMS',
    });
    await runJob('telnyx-status', {
      messageId: providerRef,
      status: 'delivered',
      hasErrors: false,
      type: 'unknown',
    });

    const [smsAfter, whatsappAfter] = await Promise.all([
      prisma.message.findUniqueOrThrow({ where: { id: sms.id } }),
      prisma.message.findUniqueOrThrow({ where: { id: whatsapp.id } }),
    ]);
    expect(smsAfter.status).toBe(MessageStatus.delivered);
    expect(whatsappAfter.status).toBe(MessageStatus.queued);
  });

  it('allows later confirmed delivery to correct an earlier failure', async () => {
    const providerRef = `email-${businessId}-${sequence++}`;
    const message = await createMessage(
      MessageChannel.email,
      MessageStatus.queued,
      providerRef,
    );

    await runJob('email-event', {
      type: 'email.bounced',
      data: { email_id: providerRef },
    });
    await runJob('email-event', {
      type: 'email.delivered',
      data: { email_id: providerRef },
    });
    await runJob('email-event', {
      type: 'email.sent',
      data: { email_id: providerRef },
    });

    await expect(
      prisma.message.findUniqueOrThrow({ where: { id: message.id } }),
    ).resolves.toMatchObject({ status: MessageStatus.delivered });
  });

  it('refreshes the WhatsApp window when one active customer owns the sender number', async () => {
    const phone = `+1555${Date.now().toString().slice(-7)}91`;
    const customer = await prisma.customer.create({
      data: { businessId, phone, name: 'Unique webhook sender' },
    });

    await runJob('meta-inbound', { from: phone });

    expect(refreshWhatsappWindow).toHaveBeenCalledTimes(1);
    expect(refreshWhatsappWindow).toHaveBeenCalledWith(businessId, customer.id);
  });

  it('maps a contextual Meta reply to its outbound tenant when the phone exists in multiple businesses', async () => {
    const suffix = Date.now().toString().slice(-6);
    const phone = `+14152${suffix}`;
    const [customer, otherCustomer] = await Promise.all([
      prisma.customer.create({
        data: { businessId, phone, name: 'Quoted reply tenant one' },
      }),
      prisma.customer.create({
        data: {
          businessId: otherBusinessId,
          phone,
          name: 'Quoted reply tenant two',
        },
      }),
    ]);
    const providerRef = `meta-context-${businessId}-${sequence++}`;
    await createMessage(
      MessageChannel.whatsapp,
      MessageStatus.sent,
      providerRef,
      { businessId, customerId: customer.id, recipient: phone },
    );

    await runJob('meta-inbound', {
      id: `meta-inbound-${sequence++}`,
      from: phone,
      context: { id: providerRef },
    });

    expect(refreshWhatsappWindow).toHaveBeenCalledTimes(1);
    expect(refreshWhatsappWindow).toHaveBeenCalledWith(businessId, customer.id);
    expect(refreshWhatsappWindow).not.toHaveBeenCalledWith(
      otherBusinessId,
      otherCustomer.id,
    );
  });

  it('does not fall back to a different unique customer when a contextual reply sender mismatches', async () => {
    const stamp = Date.now().toString().slice(-6);
    const outboundPhone = `+14152${stamp}`;
    const unrelatedSenderPhone = `+12122${stamp}`;
    const [outboundCustomer, unrelatedCustomer] = await Promise.all([
      prisma.customer.create({
        data: {
          businessId,
          phone: outboundPhone,
          name: 'Context reply recipient',
        },
      }),
      prisma.customer.create({
        data: {
          businessId: otherBusinessId,
          phone: unrelatedSenderPhone,
          name: 'Unrelated unique sender',
        },
      }),
    ]);
    const providerRef = `meta-context-mismatch-${businessId}-${sequence++}`;
    await createMessage(
      MessageChannel.whatsapp,
      MessageStatus.sent,
      providerRef,
      {
        businessId,
        customerId: outboundCustomer.id,
        recipient: outboundPhone,
      },
    );

    await runJob('meta-inbound', {
      id: `meta-inbound-${sequence++}`,
      from: unrelatedSenderPhone,
      context: { id: providerRef },
    });

    expect(refreshWhatsappWindow).not.toHaveBeenCalled();
    expect(outboundCustomer.id).not.toBe(unrelatedCustomer.id);
  });

  it('does not refresh an arbitrary business WhatsApp window for a duplicate phone', async () => {
    const phone = `+1555${Date.now().toString().slice(-7)}92`;
    await Promise.all([
      prisma.customer.create({
        data: { businessId, phone, name: 'Duplicate sender one' },
      }),
      prisma.customer.create({
        data: {
          businessId: otherBusinessId,
          phone,
          name: 'Duplicate sender two',
        },
      }),
    ]);

    await runJob('meta-inbound', { from: phone });
    await runJob('telnyx-inbound', { from: phone, type: 'whatsapp' });

    expect(refreshWhatsappWindow).not.toHaveBeenCalled();
  });
});
