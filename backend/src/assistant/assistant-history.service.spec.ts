import { ClsService } from 'nestjs-cls';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AssistantService } from './assistant.service';
import { AssistantHistoryService } from './assistant-history.service';
import type { ClaudeClient } from '../ai/claude.client';
import type { AiInfraService } from '../ai/ai-infra.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AssistantHistoryService (unified Chat History)', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let service: AssistantHistoryService;
  let businessId: string;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);

    const business = await prisma.business.create({
      data: { name: 'History Test Biz', slug: `history-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        name: 'History Test User',
        email: `history-test-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    userId = user.id;

    const other = await prisma.user.create({
      data: {
        name: 'Other User',
        email: `history-other-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    otherUserId = other.id;

    const assistantService = new AssistantService(
      tenantPrisma,
      prisma,
      {} as unknown as ClaudeClient,
      {} as unknown as AiInfraService,
    );
    service = new AssistantHistoryService(tenantPrisma, prisma, assistantService);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.assistantMessage.deleteMany({ where: { conversation: { businessId } } });
      await tx.assistantConversation.deleteMany({ where: { businessId } });
      await tx.helpQueryLog.deleteMany({ where: { businessId } });
      await tx.voiceCommandDraft.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.user.delete({ where: { id: otherUserId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('merges real Business, Help and Voice rows into one list with a real topic each, newest first', async () => {
    const convo = await tenantPrisma.client.assistantConversation.create({
      data: { businessId, userId, title: 'How much did we sell today?' },
    });
    await tenantPrisma.client.assistantMessage.create({
      data: { conversationId: convo.id, role: 'user', content: 'How much did we sell today?' },
    });
    await tenantPrisma.client.assistantMessage.create({
      data: {
        conversationId: convo.id,
        role: 'assistant',
        content: 'Rs. 12,000 across 4 sales.',
        toolCalls: [{ name: 'get_revenue_today', input: {}, output: { revenue: 12000 } }],
      },
    });

    // Explicit, well-separated timestamps (not `new Date()` back-to-back) so the "newest first"
    // assertion below can't flake on two inserts landing in the same DB-timestamp millisecond.
    const helpQuery = await prisma.helpQueryLog.create({
      data: {
        businessId,
        userId,
        question: 'How do I take a sale on credit?',
        answer: 'Attach a customer, then choose Credit as the payment method.',
        sources: [{ title: 'Taking a sale on credit', url: '/help/credit-ledger-basics' }],
        createdAt: new Date(Date.now() + 2000),
      },
    });

    const voiceDraft = await tenantPrisma.client.voiceCommandDraft.create({
      data: {
        businessId,
        createdByUserId: userId,
        transcript: 'Write off 3 loaves of bread, they expired',
        action: 'record_wastage',
        args: { productName: 'Bread', qty: 3, reason: 'Expired' },
        humanSummary: 'Write off 3 x Bread as Expired',
        status: 'confirmed',
        createdAt: new Date(Date.now() + 3000),
        confirmedAt: new Date(Date.now() + 4000),
      },
    });

    const rows = await service.list(businessId, userId);
    expect(rows).toHaveLength(3);

    const businessRow = rows.find((r) => r.id === convo.id)!;
    expect(businessRow.kind).toBe('business');
    expect(businessRow.topic).toBe('Sales');
    expect(businessRow.questionCount).toBe(1);

    const helpRow = rows.find((r) => r.id === helpQuery.id)!;
    expect(helpRow.kind).toBe('help');
    expect(helpRow.topic).toBe('Credit');
    expect(helpRow.title).toBe('How do I take a sale on credit?');

    const voiceRow = rows.find((r) => r.id === voiceDraft.id)!;
    expect(voiceRow.kind).toBe('voice');
    expect(voiceRow.topic).toBe('Inventory');
    expect(voiceRow.title).toBe('Write off 3 x Bread as Expired');

    // Newest updatedAt first (voice was confirmed last, after the other two were created).
    expect(rows[0].id).toBe(voiceDraft.id);
  });

  it('getDetail returns the real underlying row for each kind, scoped to the requesting user', async () => {
    const helpQuery = await prisma.helpQueryLog.create({
      data: {
        businessId,
        userId,
        question: 'How do I run a stocktake?',
        answer: 'Open Inventory, then Stock Count.',
        sources: [],
      },
    });

    const detail = await service.getDetail(businessId, userId, 'help', helpQuery.id);
    expect(detail).toMatchObject({ question: 'How do I run a stocktake?' });

    await expect(
      service.getDetail(businessId, otherUserId, 'help', helpQuery.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.getDetail(businessId, userId, 'not-a-real-kind', helpQuery.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delete removes only the real record for that kind, never another user\'s', async () => {
    const voiceDraft = await tenantPrisma.client.voiceCommandDraft.create({
      data: {
        businessId,
        createdByUserId: userId,
        transcript: 'Add customer Sara, 555-0142',
        action: 'add_customer',
        args: { name: 'Sara', phone: '555-0142' },
        humanSummary: 'Add customer Sara (555-0142)',
        status: 'confirmed',
      },
    });

    await expect(
      service.delete(businessId, otherUserId, 'voice', voiceDraft.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    await service.delete(businessId, userId, 'voice', voiceDraft.id);

    const gone = await tenantPrisma.client.voiceCommandDraft.findUnique({
      where: { id: voiceDraft.id },
    });
    expect(gone).toBeNull();
  });
});
