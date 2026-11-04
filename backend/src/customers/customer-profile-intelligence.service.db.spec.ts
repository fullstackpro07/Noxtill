import { Role } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_ROLE,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { CustomerPrivacySettingsService } from './customer-privacy-settings.service';
import { CustomerProfileIntelligenceService } from './customer-profile-intelligence.service';

class FakeCls {
  private data: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.data[key] as T;
  }
  set(key: string, value: unknown) {
    this.data[key] = value;
  }
}

describe('Customer profile Intelligence (real MySQL)', () => {
  const cls = new FakeCls();
  let prisma: PrismaService;
  let service: CustomerProfileIntelligenceService;
  let businessId: string;
  let otherBusinessId: string;
  let branchId: string;
  let customerId: string;
  let sparseId: string;
  let foreignId: string;
  let branchCustomerId: string;
  let productId: string;
  const users: Partial<Record<Role, string>> = {};
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
  function actor(role: Role, business = businessId) {
    cls.set(CLS_KEY_BUSINESS_ID, business);
    cls.set(CLS_KEY_ROLE, role);
    cls.set(CLS_KEY_USER_ID, users[role]);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = Date.now();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'QA Customer Profile Agent',
          slug: `qa-profile-agent-${stamp}`,
          currency: 'USD',
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Foreign QA Profile',
          slug: `qa-foreign-profile-${stamp}`,
        },
      })
    ).id;
    branchId = (
      await prisma.business.create({
        data: {
          name: 'QA Profile Branch',
          slug: `qa-profile-branch-${stamp}`,
          parentId: businessId,
        },
      })
    ).id;
    for (const role of [Role.owner, Role.manager, Role.staff]) {
      const user = await prisma.user.create({
        data: {
          name: `QA Profile ${role}`,
          email: `qa-profile-${role}-${stamp}@example.test`,
          passwordHash: 'unused-test-hash',
        },
      });
      users[role] = user.id;
      await prisma.businessUser.create({
        data: { businessId, userId: user.id, role },
      });
    }
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'PRIVATE PERSON',
          phone: '+15559990001',
          email: 'private-profile@example.test',
          notes: 'PRIVATE SECRET NOTE',
          lifetimeSpend: 8765.43,
          visitCount: 4,
          lastVisitAt: ago(5),
          consentMarketing: true,
          createdAt: ago(100),
        },
      })
    ).id;
    sparseId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Sparse QA',
          phone: '+15559990002',
          consentMarketing: false,
        },
      })
    ).id;
    foreignId = (
      await prisma.customer.create({
        data: {
          businessId: otherBusinessId,
          name: 'FOREIGN SECRET',
          phone: '+15559990003',
        },
      })
    ).id;
    branchCustomerId = (
      await prisma.customer.create({
        data: {
          businessId: branchId,
          name: 'Branch QA',
          phone: '+15559990004',
        },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: { businessId, name: 'QA Service', kind: 'service' },
      })
    ).id;
    let orderNo = 1;
    for (const days of [5, 35, 40, 50])
      await prisma.order.create({
        data: {
          businessId,
          customerId,
          orderNo: orderNo++,
          status: 'completed',
          createdAt: ago(days),
          total: 99,
        },
      });
    await prisma.order.createMany({
      data: [
        {
          businessId,
          customerId,
          orderNo: orderNo++,
          status: 'cancelled',
          createdAt: ago(1),
          total: 700,
        },
        {
          businessId,
          customerId,
          orderNo: orderNo++,
          status: 'pending',
          createdAt: ago(1),
          total: 800,
        },
        {
          businessId,
          customerId,
          orderNo: orderNo++,
          status: 'completed',
          isQuotation: true,
          createdAt: ago(1),
          total: 900,
        },
        {
          businessId,
          customerId,
          orderNo: orderNo++,
          status: 'completed',
          createdAt: ago(100),
          total: 1000,
        },
        {
          businessId: otherBusinessId,
          customerId: foreignId,
          orderNo: 1,
          status: 'completed',
          total: 999999,
        },
      ],
    });
    await prisma.appointment.createMany({
      data: [
        {
          businessId,
          customerId,
          serviceId: productId,
          startsAt: ago(5),
          endsAt: ago(5),
          status: 'completed',
        },
        {
          businessId,
          customerId,
          serviceId: productId,
          startsAt: ago(4),
          endsAt: ago(4),
          status: 'no_show',
        },
        {
          businessId,
          customerId,
          serviceId: productId,
          startsAt: ago(-2),
          endsAt: ago(-2),
          status: 'confirmed',
        },
      ],
    });
    for (const status of ['queued', 'sent', 'delivered', 'failed'] as const)
      await prisma.message.create({
        data: {
          businessId,
          customerId,
          channel: 'email',
          category: 'marketing',
          templateKey: 'qa',
          status,
          customBody: 'PRIVATE MESSAGE BODY',
          payload: { secret: 'PRIVATE PAYLOAD' },
        },
      });
    await prisma.memoryNote.create({
      data: {
        businessId,
        subjectType: 'customer',
        subjectId: customerId,
        body: 'PRIVATE MEMORY CONTENT',
      },
    });
    const program = await prisma.loyaltyProgram.create({
      data: {
        businessId,
        name: 'QA Loyalty',
        type: 'punch_card',
        stampsRequired: 10,
      },
    });
    await prisma.loyaltyMember.create({
      data: { businessId, customerId, programId: program.id, stampCount: 4 },
    });
    const plan = await prisma.membershipPlan.create({
      data: { businessId, name: 'PRIVATE PLAN NAME', price: 9999 },
    });
    await prisma.membership.create({
      data: { businessId, customerId, planId: plan.id, status: 'active' },
    });
    const scopedCls = cls as unknown as ClsService;
    const tenant = new TenantPrismaService(prisma, scopedCls);
    service = new CustomerProfileIntelligenceService(
      tenant,
      new PoliciesService(prisma, scopedCls, new CapabilitiesService(prisma)),
      new SpecialistAgentPolicyService(prisma, scopedCls),
      new CustomerPrivacySettingsService(tenant),
    );
  });

  beforeEach(async () => {
    actor(Role.owner);
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {}, disabledModules: [] },
    });
    await prisma.roleCapabilityOverride.deleteMany({ where: { businessId } });
    await prisma.customerPrivacySettings.deleteMany({ where: { businessId } });
    await prisma.customerSupportTicket.deleteMany({ where: { businessId } });
    await prisma.privateFeedback.deleteMany({ where: { businessId } });
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        phone: '+15559990001',
        status: 'active',
        consentMarketing: true,
        optedOut: false,
      },
    });
  });

  afterAll(async () => {
    const ids = [businessId, otherBusinessId, branchId];
    const where = { businessId: { in: ids } };
    await prisma.customerSupportTicket.deleteMany({ where });
    await prisma.privateFeedback.deleteMany({ where });
    await prisma.message.deleteMany({ where });
    await prisma.appointment.deleteMany({ where });
    await prisma.memoryNote.deleteMany({ where });
    await prisma.membership.deleteMany({ where });
    await prisma.membershipPlan.deleteMany({ where });
    await prisma.loyaltyMember.deleteMany({ where });
    await prisma.loyaltyProgram.deleteMany({ where });
    await prisma.order.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.customerPrivacySettings.deleteMany({ where });
    await prisma.roleCapabilityOverride.deleteMany({ where });
    await prisma.businessUser.deleteMany({ where });
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(users) } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [branchId, otherBusinessId] } },
    });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('projects real source counts, transparent decline evidence and recorded message status without writes or raw PII', async () => {
    await prisma.privateFeedback.createMany({
      data: [
        {
          businessId,
          customerId,
          stars: 5,
          status: 'open',
          message: 'PRIVATE FEEDBACK BODY',
          createdAt: ago(3),
        },
        {
          businessId,
          customerId,
          stars: 3,
          status: 'resolved',
          message: 'PRIVATE RESOLUTION TEXT',
          createdAt: ago(8),
        },
      ],
    });
    const before = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    const review = await service.review(customerId);
    expect(review).toMatchObject({
      coverage: 'partial',
      retainsCustomerSummary: false,
      usesAiProvider: false,
      narrative: {
        state: 'available',
        method: 'deterministic',
      },
      profile: { recordedVisits: 4 },
      orders: { currentCount: 1, previousCount: 3 },
      rfm: {
        state: 'available',
        recency: {
          state: 'available',
          daysSinceLatestCompletedOrder: 5,
        },
        frequency: {
          state: 'available',
          completedNonQuotationOrderCount: 5,
        },
        monetary: {
          state: 'available',
          recordedLifetimeSpend: 8765.43,
          currency: 'USD',
        },
        score: { state: 'not_configured', value: null },
      },
      bookings: {
        statuses: { completed: 1, no_show: 1 },
        next: { status: 'confirmed' },
      },
      messages: { statuses: { queued: 1, sent: 1, delivered: 1, failed: 1 } },
      loyalty: {
        recordedEnrollments: 1,
        recordedStamps: 4,
        membershipStatuses: { active: 1 },
      },
      notes: { count: 1 },
      feedback: {
        state: 'available',
        count: 2,
        averageStars: 4,
        statuses: { open: 1, resolved: 1 },
      },
      financial: { recordedLifetimeSpend: 8765.43, currency: 'USD' },
      followUp: {
        state: 'activity_decline',
        confidence: 'not_calibrated',
        automatedAction: false,
      },
      marketing: { state: 'requires_channel_check', sendsMessages: false },
    });
    expect(review.followUp.reason).toContain('not a churn prediction');
    expect(review.narrative.text).toContain(
      'Completed non-quotation orders were 1 in the current 30-day creation window and 3 in the previous window.',
    );
    expect(review.narrative.text).toContain('not an AI-generated conclusion');
    expect(review.narrative.text).toContain(
      'Returns and refunds are not netted',
    );
    const payload = JSON.stringify(review);
    for (const secret of [
      'PRIVATE PERSON',
      '+15559990001',
      'private-profile@',
      'PRIVATE SECRET NOTE',
      'PRIVATE MEMORY CONTENT',
      'PRIVATE FEEDBACK BODY',
      'PRIVATE RESOLUTION TEXT',
      'PRIVATE MESSAGE BODY',
      'PRIVATE PAYLOAD',
      'PRIVATE PLAN NAME',
      'FOREIGN SECRET',
      '999999',
    ])
      expect(payload).not.toContain(secret);
    expect(
      await prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
    ).toEqual(before);
    expect(
      await prisma.specialistAgentRun.count({ where: { businessId } }),
    ).toBe(0);
  });

  it('does not imply retention risk when the own baseline is sparse', async () => {
    expect(await service.review(sparseId)).toMatchObject({
      followUp: { state: 'insufficient_history' },
      marketing: {
        state: 'excluded',
        exclusions: ['Marketing consent is not recorded.'],
      },
    });
  });

  it('applies the business-configured minimum order decline before raising a cue', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: { 'agents.customerRetentionMinimumOrderDecline': 3 },
      },
    });

    const review = await service.review(customerId);
    expect(review.windows.minimumOrderDecline).toBe(3);
    expect(review.followUp).toMatchObject({
      state: 'below_decline_threshold',
      confidence: 'not_calibrated',
      automatedAction: false,
    });
    expect(review.followUp.reason).toContain('fell from 3 to 1');
    expect(review.followUp.reason).toContain('minimum of 3');
  });

  it('refuses unprivileged staff; explicitly allowed staff still receive no money, restricted notes or voice support', async () => {
    actor(Role.staff);
    await expect(service.review(customerId)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_AGENT_FORBIDDEN' },
    });
    await prisma.roleCapabilityOverride.create({
      data: {
        businessId,
        role: Role.staff,
        capabilities: [
          CAPABILITIES.CUSTOMER_AGENT_RUN,
          CAPABILITIES.PROFIT_VIEW,
        ],
      },
    });
    await prisma.customerPrivacySettings.create({
      data: { businessId, notesVisibleToStaff: false },
    });
    const review = await service.review(customerId);
    expect(review.financial).toMatchObject({
      state: 'restricted',
      recordedLifetimeSpend: null,
    });
    expect(review.rfm.monetary).toMatchObject({
      state: 'restricted',
      recordedLifetimeSpend: null,
      currency: null,
    });
    expect(review.notes).toMatchObject({ state: 'restricted', count: null });
    expect(review.support).toMatchObject({
      state: 'restricted',
      unresolvedCount: null,
    });
    expect(review.feedback.state).toBe('restricted');
    expect(JSON.stringify(review)).not.toContain('8765.43');
    expect(JSON.stringify(review)).not.toContain('creditLimit');
  });

  it('rechecks live manager capability changes, including financial restrictions', async () => {
    actor(Role.manager);
    await prisma.roleCapabilityOverride.create({
      data: {
        businessId,
        role: Role.manager,
        capabilities: [CAPABILITIES.CUSTOMER_AGENT_RUN],
      },
    });
    expect((await service.review(customerId)).financial.state).toBe(
      'restricted',
    );
    await prisma.roleCapabilityOverride.update({
      where: { businessId_role: { businessId, role: Role.manager } },
      data: { capabilities: [] },
    });
    await expect(service.review(customerId)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_AGENT_FORBIDDEN' },
    });
  });

  it('honors the agent kill switch and module source exclusions', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'agents.customerEnabled': false } },
    });
    await expect(service.review(customerId)).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_DISABLED' },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {},
        disabledModules: [
          'orders',
          'bookings',
          'unified-inbox',
          'receptionist',
          'reviews',
        ],
      },
    });
    const review = await service.review(customerId);
    expect(review.orders).toMatchObject({
      state: 'module_disabled',
      currentCount: null,
    });
    expect(review.rfm).toMatchObject({
      state: 'module_disabled',
      recency: {
        state: 'module_disabled',
        daysSinceLatestCompletedOrder: null,
      },
      frequency: {
        state: 'module_disabled',
        completedNonQuotationOrderCount: null,
      },
    });
    expect(review.bookings).toMatchObject({
      state: 'module_disabled',
      statuses: null,
    });
    expect(review.messages).toMatchObject({
      state: 'module_disabled',
      statuses: null,
    });
    expect(review.support.state).toBe('restricted');
    expect(review.feedback.state).toBe('module_disabled');
    expect(review.followUp.state).toBe('not_available');
    expect(review.narrative.text).toContain(
      'Order history is not available because the Orders module is disabled.',
    );
    await prisma.business.update({
      where: { id: businessId },
      data: { disabledModules: ['customers'] },
    });
    await expect(service.review(customerId)).rejects.toMatchObject({
      response: { code: 'BUSINESS_MODULE_DISABLED' },
    });
  });

  it('keeps branch scope isolated and inherits root module selection', async () => {
    await expect(service.review(branchCustomerId)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_NOT_FOUND' },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { disabledModules: ['orders'] },
    });
    actor(Role.owner, branchId);
    expect((await service.review(branchCustomerId)).orders.state).toBe(
      'module_disabled',
    );
    await expect(service.review(customerId)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_NOT_FOUND' },
    });
  });

  it('never resurfaces a live review after canonical erasure and never accepts a foreign customer id', async () => {
    await service.review(customerId);
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        phone: `erased-${customerId}`,
        name: 'Erased Customer',
        email: null,
        notes: null,
      },
    });
    await expect(service.review(customerId)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_AGENT_ERASED' },
    });
    await expect(service.review(foreignId)).rejects.toMatchObject({
      response: { code: 'CUSTOMER_NOT_FOUND' },
    });
  });

  it('treats opt-out as an exclusion even with consent, without claiming a sent message', async () => {
    await prisma.customer.update({
      where: { id: customerId },
      data: { optedOut: true, consentMarketing: true },
    });
    const review = await service.review(customerId);
    expect(review.marketing).toMatchObject({
      state: 'excluded',
      exclusions: ['Customer has opted out.'],
      sendsMessages: false,
    });
    await prisma.customer.update({
      where: { id: customerId },
      data: { status: 'blocked' },
    });
    expect((await service.review(customerId)).followUp.state).toBe(
      'inactive_customer',
    );
  });

  it('prioritizes unresolved support only for an authorized caller and ignores resolved tickets', async () => {
    await prisma.customerSupportTicket.createMany({
      data: [
        {
          businessId,
          customerId,
          sourceKey: 'qa-open',
          title: 'PRIVATE TICKET TITLE',
          body: 'PRIVATE TICKET BODY',
          status: 'open',
        },
        {
          businessId,
          customerId,
          sourceKey: 'qa-closed',
          title: 'Closed QA',
          body: 'Closed QA',
          status: 'resolved',
        },
      ],
    });
    const review = await service.review(customerId);
    expect(review).toMatchObject({
      support: { unresolvedCount: 1 },
      followUp: { state: 'support_review', href: '/receptionist/history' },
    });
    expect(JSON.stringify(review)).not.toContain('PRIVATE TICKET');
  });
});
