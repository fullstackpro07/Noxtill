import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { LocaleService } from '../common/localization/locale.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { NotificationsService } from '../notifications/notifications.service';
import type { SendGateService } from '../messaging/send-gate.service';
import type { SocialInboxService } from '../social/social-inbox.service';
import type { WhatsappWindowService } from '../whatsapp/whatsapp-window.service';
import type { AiInfraService } from '../ai/ai-infra.service';
import type { PoliciesService } from '../common/policies/policies.service';
import { InboxSettingsService } from './inbox-settings.service';
import { InboxCoreService } from './inbox-core.service';
import { InboxFactsService } from './inbox-facts.service';
import { InboxSendService } from './inbox-send.service';
import { InboxAiService } from './inbox-ai.service';
import { InboxAutomationService } from './inbox-automation.service';
import { InboxService } from './inbox.service';
import { InboxRulesService } from './inbox-rules.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('Unified Inbox (real DB)', () => {
  let prisma: PrismaService;
  let businessId: string;
  let ownerId: string;
  let staffId: string;
  let customerId: string;
  let orderId: string;
  let inbox: InboxService;
  let automation: InboxAutomationService;
  let rules: InboxRulesService;
  let facts: InboxFactsService;
  let owner: AuthenticatedUser;
  let staff: AuthenticatedUser;

  const notifications = { create: jest.fn().mockResolvedValue(null) };
  const socialInbox = { reply: jest.fn().mockResolvedValue({}) };
  const window = {
    isOpen: jest.fn().mockResolvedValue(true),
    refresh: jest.fn().mockResolvedValue(undefined),
  };
  const aiInfra = {
    createMessage: jest.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'It left at 4:02 PM and should reach you by 4:35 PM.',
        },
      ],
      stopReason: 'end_turn',
      inputTokens: 10,
      outputTokens: 10,
    }),
  };
  const canManage = { value: true };
  const policies = {
    actorCan: jest.fn(() => Promise.resolve(canManage.value)),
  };
  const sendGate = {
    send: jest.fn(
      async (p: {
        businessId: string;
        templateKey: string;
        channel?: 'whatsapp' | 'sms' | 'email';
        customerId?: string;
      }) =>
        prisma.message.create({
          data: {
            businessId: p.businessId,
            customerId: p.customerId,
            channel: p.channel ?? 'whatsapp',
            category: 'utility',
            templateKey: p.templateKey,
            payload: {},
          },
        }),
    ),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const settings = new InboxSettingsService(prisma);
    const core = new InboxCoreService(
      prisma,
      notifications as unknown as NotificationsService,
      settings,
    );
    facts = new InboxFactsService(prisma, new LocaleService());
    const sender = new InboxSendService(
      prisma,
      sendGate as unknown as SendGateService,
      socialInbox as unknown as SocialInboxService,
      window as unknown as WhatsappWindowService,
      core,
    );
    const ai = new InboxAiService(
      prisma,
      aiInfra as unknown as AiInfraService,
      facts,
      settings,
      core,
      sender,
    );
    automation = new InboxAutomationService(prisma, core, settings, sender, ai);
    inbox = new InboxService(
      tenant,
      prisma,
      policies as unknown as PoliciesService,
      core,
      facts,
      sender,
      ai,
      automation,
      settings,
    );
    rules = new InboxRulesService(tenant, core);

    const stamp = Date.now();
    const business = await prisma.business.create({
      data: {
        name: 'Inbox Test Biz',
        slug: `inbox-test-${stamp}`,
        currency: 'PKR',
        timezone: 'UTC',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const o = await prisma.user.create({
      data: {
        name: 'Olivia Owner',
        email: `inbox-owner-${stamp}@example.com`,
        passwordHash: 'x',
      },
    });
    const s = await prisma.user.create({
      data: {
        name: 'Sam Staff',
        email: `inbox-staff-${stamp}@example.com`,
        passwordHash: 'x',
      },
    });
    ownerId = o.id;
    staffId = s.id;
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: ownerId, role: Role.owner },
        { businessId, userId: staffId, role: Role.staff },
      ],
    });
    owner = { sub: ownerId, businessId, role: Role.owner, capabilities: [] };
    staff = { sub: staffId, businessId, role: Role.staff, capabilities: [] };

    const customer = await prisma.customer.create({
      data: { businessId, name: 'Sophia Brown', phone: '+923001112233' },
    });
    customerId = customer.id;
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 1048,
        customerId,
        status: 'confirmed',
        total: 4250,
        subtotal: 4250,
      },
    });
    orderId = order.id;
    await prisma.payment.create({
      data: { orderId, method: 'card', amount: 4250 },
    });
    await prisma.delivery.create({
      data: {
        businessId,
        orderId,
        status: 'en_route',
        addressLine: 'Gulberg',
        assignedAt: new Date(Date.now() - 12 * 60000),
        promisedAt: new Date(Date.now() + 20 * 60000),
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    canManage.value = true;
  });

  afterAll(async () => {
    await prisma.inboxAiDraft.deleteMany({ where: { businessId } });
    await prisma.inboxMessage.deleteMany({ where: { businessId } });
    await prisma.inboxEvent.deleteMany({ where: { businessId } });
    await prisma.inboxConversation.deleteMany({ where: { businessId } });
    await prisma.inboxRule.deleteMany({ where: { businessId } });
    await prisma.inboxSettings.deleteMany({ where: { businessId } });
    await prisma.message.deleteMany({ where: { businessId } });
    await prisma.delivery.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('files an inbound WhatsApp message under the matching customer, once', async () => {
    const input = {
      businessId,
      channel: 'whatsapp',
      contactHandle: '923001112233',
      contactName: 'Sophia',
      text: 'Hi, where is my order?',
      externalKey: 'whatsapp:wamid.1',
    };
    const conv = await automation.ingest(input);
    expect(conv).not.toBeNull();
    expect(conv!.contactHandle).toBe('+923001112233');
    expect(conv!.customerId).toBe(customerId);
    expect(conv!.unreadCount).toBe(1);
    expect(conv!.awaitingReplySince).not.toBeNull();

    // The auto-draft was built from the real order, not invented.
    const call = aiInfra.createMessage.mock.calls[0] as unknown[];
    const prompt = (call[2] as { messages: { content: string }[] }).messages[0]
      .content;
    expect(prompt).toContain('Their open order #1048');

    // Webhook redelivery of the same provider message is ignored.
    expect(await automation.ingest(input)).toBeNull();
    expect(
      await prisma.inboxMessage.count({
        where: { conversationId: conv!.id, kind: 'in' },
      }),
    ).toBe(1);
  });

  it('drafts a reply from the real order and delivery, and never sends it on its own', async () => {
    const conv = await prisma.inboxConversation.findFirstOrThrow({
      where: { businessId, customerId },
    });
    const draft = await prisma.inboxAiDraft.findFirst({
      where: { conversationId: conv.id, status: 'pending' },
    });
    expect(draft).not.toBeNull();
    expect(draft!.sources).toEqual(
      expect.arrayContaining(['order #1048', 'live delivery record']),
    );
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('shows real context cards for the conversation', async () => {
    const conv = await prisma.inboxConversation.findFirstOrThrow({
      where: { businessId, customerId },
    });
    const detail = await inbox.detail(owner, conv.id);
    expect(detail.context.map((c) => c.t)).toEqual(
      expect.arrayContaining([
        'Order #1048 is out for delivery',
        'Paid in full',
      ]),
    );
    expect(detail.draft).not.toBeNull();
    expect(detail.stats.orders).toBe('1');
  });

  it('sends an approved draft through the send gate and records who approved it', async () => {
    const conv = await prisma.inboxConversation.findFirstOrThrow({
      where: { businessId, customerId },
    });
    const draft = await prisma.inboxAiDraft.findFirstOrThrow({
      where: { conversationId: conv.id, status: 'pending' },
    });
    await inbox.sendDraft(owner, draft.id);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'inbox_reply',
        channel: 'whatsapp',
        customerId,
        variables: { message: draft.text },
      }),
    );
    const after = await prisma.inboxConversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
    expect(after.awaitingReplySince).toBeNull();
    expect(after.firstReplyMinutes).not.toBeNull();
    expect(
      (await prisma.inboxAiDraft.findUniqueOrThrow({ where: { id: draft.id } }))
        .status,
    ).toBe('sent');
    const ev = await prisma.inboxEvent.findFirstOrThrow({
      where: { conversationId: conv.id, kind: 'ai.sent' },
    });
    expect(ev.actorName).toBe('Olivia Owner');
  });

  it('skips drafting (and says why) when no record backs the answer', async () => {
    const conv = await automation.ingest({
      businessId,
      channel: 'sms',
      contactHandle: '+15550001111',
      text: 'Are you open on Sunday?',
    });
    expect(
      await prisma.inboxAiDraft.count({ where: { conversationId: conv!.id } }),
    ).toBe(0);
    const skip = await prisma.inboxEvent.findFirstOrThrow({
      where: { conversationId: conv!.id, kind: 'ai.skipped' },
    });
    expect(skip.detail).toContain('No customer record');
  });

  it('runs keyword rules: tags, moves to the top, counts the run, and alerts on money questions', async () => {
    await rules.create(owner, {
      name: 'Money to the top',
      trigger: 'keyword',
      keywords: ['refund', 'balance'],
      tag: 'Money',
      pinToTop: true,
    });
    const conv = await automation.ingest({
      businessId,
      channel: 'sms',
      contactHandle: '+15550002222',
      text: 'Can I get a refund please?',
    });
    expect(conv!.tags).toEqual(['Money']);
    expect(conv!.pinned).toBe(true);
    const rule = await prisma.inboxRule.findFirstOrThrow({
      where: { businessId, name: 'Money to the top' },
    });
    expect(rule.runCount).toBe(1);
    expect(notifications.create).toHaveBeenCalledWith(
      businessId,
      ownerId,
      expect.objectContaining({
        title: expect.stringContaining('Money question') as string,
      }),
      'inbox_money_question',
    );
  });

  it('rejects a keyword rule that would send a message', async () => {
    await expect(
      rules.create(owner, {
        name: 'Bad',
        trigger: 'keyword',
        keywords: ['hi'],
        message: 'hello',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('flags a conversation once it has gone unanswered past the rule', async () => {
    await rules.create(owner, {
      name: 'Unanswered after 15 minutes',
      trigger: 'unanswered',
      minutes: 15,
    });
    const conv = await automation.ingest({
      businessId,
      channel: 'sms',
      contactHandle: '+15550003333',
      text: 'Hello?',
      receivedAt: new Date(Date.now() - 20 * 60000),
    });
    await automation.tick(businessId);
    const flagged = await prisma.inboxConversation.findUniqueOrThrow({
      where: { id: conv!.id },
    });
    expect(flagged.flaggedAt).not.toBeNull();
    expect(notifications.create).toHaveBeenCalledWith(
      businessId,
      ownerId,
      expect.anything(),
      'inbox_flagged',
    );
  });

  it('lets staff see only their own and unassigned conversations', async () => {
    const mine = await automation.ingest({
      businessId,
      channel: 'sms',
      contactHandle: '+15550004444',
      text: 'For staff',
    });
    const theirs = await automation.ingest({
      businessId,
      channel: 'sms',
      contactHandle: '+15550005555',
      text: 'For owner',
    });
    await prisma.inboxConversation.update({
      where: { id: mine!.id },
      data: { assigneeUserId: staffId },
    });
    await prisma.inboxConversation.update({
      where: { id: theirs!.id },
      data: { assigneeUserId: ownerId },
    });
    canManage.value = false;
    const list = await inbox.list(staff, { view: 'open' });
    const ids = list.items.map((i) => i.id);
    expect(ids).toContain(mine!.id);
    expect(ids).not.toContain(theirs!.id);
    await expect(inbox.detail(staff, theirs!.id)).rejects.toBeInstanceOf(
      AppException,
    );
    // Staff cannot hand someone else's conversation around.
    await expect(
      inbox.assign(staff, mine!.id, { userId: ownerId }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('records a hand-over, tells both people, and puts it in the thread', async () => {
    const conv = await automation.ingest({
      businessId,
      channel: 'sms',
      contactHandle: '+15550006666',
      text: 'Hand me over',
    });
    await prisma.inboxConversation.update({
      where: { id: conv!.id },
      data: { assigneeUserId: ownerId },
    });
    await inbox.assign(owner, conv!.id, {
      userId: staffId,
      reason: 'Sam knows this customer',
    });
    const line = await prisma.inboxMessage.findFirstOrThrow({
      where: { conversationId: conv!.id, kind: 'event' },
    });
    expect(line.body).toContain('Sam knows this customer');
    expect(notifications.create).toHaveBeenCalledWith(
      businessId,
      staffId,
      expect.objectContaining({
        title: expect.stringContaining('is now yours') as string,
      }),
      'inbox_reassigned',
    );
  });

  it('reopens a closed conversation when the customer writes again', async () => {
    const conv = await automation.ingest({
      businessId,
      channel: 'sms',
      contactHandle: '+15550007777',
      text: 'First',
    });
    await inbox.close(owner, conv!.id);
    const again = await automation.ingest({
      businessId,
      channel: 'sms',
      contactHandle: '+15550007777',
      text: 'Second',
    });
    expect(again!.id).toBe(conv!.id);
    expect(again!.status).toBe('open');
  });

  it('fills saved-reply brackets from real records and leaves unknowns bracketed', async () => {
    const conv = await prisma.inboxConversation.findFirstOrThrow({
      where: { businessId, customerId },
    });
    const f = await facts.forConversation(businessId, conv);
    const out = facts.fillPlaceholders(
      'Order [order number] should reach you by [promised time]. Code: [voucher code]',
      f,
      conv.contactName,
    );
    expect(out.text).toContain('#1048');
    expect(out.text).not.toContain('[promised time]');
    expect(out.unfilled).toEqual(['voucher code']);
  });
});
