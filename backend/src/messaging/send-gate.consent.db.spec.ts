import { randomUUID } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { TemplateRegistryService } from './templates/template-registry.service';
import { SendGateService } from './send-gate.service';
import { Queue } from 'bullmq';

describe('SendGateService marketing consent (real MySQL)', () => {
  const prisma = new PrismaService();
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  let businessId: string;
  let customerId: string;
  let tenant: TenantPrismaService;
  let sendGate: SendGateService;

  beforeAll(async () => {
    await prisma.$connect();
    const key = randomUUID();
    const phoneSuffix = key
      .replaceAll('-', '')
      .split('')
      .map((character) => (Number.parseInt(character, 16) % 10).toString())
      .join('')
      .slice(0, 10);
    businessId = (
      await prisma.business.create({
        data: { name: 'QA Messaging Consent', slug: `qa-msg-consent-${key}` },
      })
    ).id;
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'QA Customer Without Marketing Consent',
          phone: `+1555${phoneSuffix}`,
          consentMarketing: false,
          optedOut: false,
        },
      })
    ).id;
    tenant = new TenantPrismaService(prisma, {
      get: () => businessId,
    } as unknown as ClsService);
    sendGate = new SendGateService(
      tenant,
      new TemplateRegistryService(),
      queue as unknown as Queue,
    );
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    queue.add.mockClear();
    await prisma.customerChannelConsent.deleteMany({
      where: { businessId, customerId },
    });
    await prisma.customer.update({
      where: { id: customerId },
      data: { consentMarketing: false, optedOut: false },
    });
  });

  const params = {
    businessId: '',
    customerId: '',
    templateKey: 'campaign',
    variables: { body: 'A reviewed follow-up.' },
    customBody: 'A reviewed follow-up.',
  };

  it('refuses to preview or queue marketing without current CRM consent', async () => {
    const input = { ...params, businessId, customerId };

    await expect(sendGate.preview(input)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_MARKETING_CONSENT_REQUIRED' },
    });
    await expect(sendGate.send(input)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_MARKETING_CONSENT_REQUIRED' },
    });

    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('requires a channel grant even when the broad CRM marketing flag is true', async () => {
    await prisma.customer.update({
      where: { id: customerId },
      data: { consentMarketing: true },
    });
    const input = { ...params, businessId, customerId };

    await expect(sendGate.preview(input)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_CHANNEL_CONSENT_REQUIRED' },
    });
    await expect(sendGate.send(input)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_CHANNEL_CONSENT_REQUIRED' },
    });
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();

    await prisma.customerChannelConsent.create({
      data: {
        businessId,
        customerId,
        channel: 'whatsapp',
        state: 'granted',
        source: 'website_form',
        evidenceReference: `default-channel-consent-${randomUUID()}`,
        revision: 1,
        recordedByUserId: customerId,
      },
    });
    await expect(sendGate.preview(input)).resolves.toMatchObject({
      channel: 'whatsapp',
      category: 'marketing',
      renderedText: 'A reviewed follow-up.',
    });
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();

    const message = await sendGate.send(input);
    expect(message).toMatchObject({
      businessId,
      customerId,
      category: 'marketing',
      templateKey: 'campaign',
      customBody: 'A reviewed follow-up.',
      status: 'queued',
    });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('rechecks the newest channel-specific grant for the Customer Agent send path', async () => {
    await prisma.customer.update({
      where: { id: customerId },
      data: { consentMarketing: true, optedOut: false },
    });
    const strictInput = {
      ...params,
      businessId,
      customerId,
      requireChannelConsent: true,
    };
    await expect(sendGate.preview(strictInput)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_CHANNEL_CONSENT_REQUIRED' },
    });
    await expect(sendGate.send(strictInput)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_CHANNEL_CONSENT_REQUIRED' },
    });
    expect(queue.add).not.toHaveBeenCalled();

    await prisma.customerChannelConsent.create({
      data: {
        businessId,
        customerId,
        channel: 'whatsapp',
        state: 'granted',
        source: 'website_form',
        evidenceReference: `send-gate-form-${randomUUID()}`,
        revision: 1,
        recordedByUserId: customerId,
      },
    });
    await expect(sendGate.preview(strictInput)).resolves.toMatchObject({
      channel: 'whatsapp',
      category: 'marketing',
    });
    const queued = await sendGate.send({
      ...strictInput,
      idempotencyKey: 'customer-agent-channel-consent-queue',
    });
    expect(queued.payload).toMatchObject({ __channelConsentRequired: true });
    expect(queue.add).toHaveBeenCalledTimes(1);

    await prisma.customerChannelConsent.create({
      data: {
        businessId,
        customerId,
        channel: 'whatsapp',
        state: 'revoked',
        source: 'customer_portal',
        evidenceReference: `send-gate-revoke-${randomUUID()}`,
        revision: 2,
        recordedByUserId: customerId,
      },
    });
    await expect(
      sendGate.send({
        ...strictInput,
        idempotencyKey: 'customer-agent-channel-consent-after-revoke',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_CHANNEL_CONSENT_REQUIRED' },
    });
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
