import { Role } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_ROLE,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { PoliciesService } from '../common/policies/policies.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import type { AiInfraService } from '../ai/ai-infra.service';
import type {
  CreateMessageParams,
  CreateMessageResult,
} from '../ai/claude.client';
import { ProcurementService } from '../procurement/procurement.service';
import { ActionCenterService } from '../dashboard/action-center.service';
import { StockTransfersService } from '../branches/stock-transfers.service';
import { AuditService } from '../common/audit/audit.service';
import { CustomerAgentActionsService } from './customer-agent-actions.service';
import { SendGateService } from '../messaging/send-gate.service';
import { TemplateRegistryService } from '../messaging/templates/template-registry.service';
import { Queue } from 'bullmq';
import { CustomerTagsService } from './customer-tags.service';
import { CustomersService } from './customers.service';

class FakeCls {
  data: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.data[key] as T;
  }
  set(key: string, value: unknown) {
    this.data[key] = value;
  }
}

describe('Customer agent follow-up tasks and message drafts (MySQL)', () => {
  const cls = new FakeCls();
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let policies: PoliciesService;
  let service: CustomerAgentActionsService;
  let customers: CustomersService;
  let actionCenter: ActionCenterService;
  let businessId: string;
  let foreignBusinessId: string;
  let managerId: string;
  let staffId: string;
  let staffMembershipId: string;
  let customerId: string;
  let customerPhone: string;
  let optedOutCustomerId: string;
  let foreignCustomerId: string;
  const createMessage = jest.fn<
    Promise<CreateMessageResult>,
    [string, string, CreateMessageParams, unknown?, string?, string?]
  >();
  const messageQueue = { add: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = Date.now();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'QA Customer Actions',
          slug: `qa-customer-actions-${stamp}`,
        },
      })
    ).id;
    foreignBusinessId = (
      await prisma.business.create({
        data: {
          name: 'QA Other Customer Actions',
          slug: `qa-customer-actions-other-${stamp}`,
        },
      })
    ).id;
    managerId = (
      await prisma.user.create({
        data: {
          name: 'QA Customer Action Manager',
          email: `qa-customer-action-manager-${stamp}@example.test`,
          passwordHash: 'unused-test-password',
        },
      })
    ).id;
    staffId = (
      await prisma.user.create({
        data: {
          name: 'QA Customer Action Staff',
          email: `qa-customer-action-staff-${stamp}@example.test`,
          passwordHash: 'unused-test-password',
        },
      })
    ).id;
    await prisma.businessUser.create({
      data: { businessId, userId: managerId, role: Role.manager },
    });
    staffMembershipId = (
      await prisma.businessUser.create({
        data: { businessId, userId: staffId, role: Role.staff },
      })
    ).id;
    const [customer, optedOut, foreign] = await Promise.all([
      prisma.customer.create({
        data: {
          businessId,
          name: 'QA Follow-up Customer',
          phone: `+15555${String(stamp).slice(-6)}01`,
          email: `follow-up-${stamp}@example.test`,
          consentMarketing: true,
        },
      }),
      prisma.customer.create({
        data: {
          businessId,
          name: 'QA Opted Out Customer',
          phone: `+15555${String(stamp).slice(-6)}02`,
          email: `opted-out-${stamp}@example.test`,
          consentMarketing: true,
          optedOut: true,
        },
      }),
      prisma.customer.create({
        data: {
          businessId: foreignBusinessId,
          name: 'QA Foreign Customer',
          phone: `+15555${String(stamp).slice(-6)}03`,
        },
      }),
    ]);
    customerId = customer.id;
    customerPhone = customer.phone;
    optedOutCustomerId = optedOut.id;
    foreignCustomerId = foreign.id;
    const scoped = cls as unknown as ClsService;
    tenant = new TenantPrismaService(prisma, scoped);
    customers = new CustomersService(
      tenant,
      new AuditService(tenant, scoped),
      new CustomerTagsService(tenant),
    );
    policies = new PoliciesService(
      prisma,
      scoped,
      new CapabilitiesService(prisma),
    );
    service = new CustomerAgentActionsService(
      tenant,
      policies,
      new SpecialistAgentPolicyService(prisma, scoped),
      { createMessage } as unknown as AiInfraService,
      new SendGateService(
        tenant,
        new TemplateRegistryService(),
        messageQueue as unknown as Queue,
      ),
    );
    actionCenter = new ActionCenterService(
      tenant,
      new ProcurementService(tenant, policies),
      new StockTransfersService(prisma),
    );
  });

  beforeEach(async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_ROLE, Role.manager);
    cls.set(CLS_KEY_USER_ID, managerId);
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {}, disabledModules: [] },
    });
    const latestWhatsappConsent = await prisma.customerChannelConsent.findFirst(
      {
        where: { businessId, customerId, channel: 'whatsapp' },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      },
    );
    await prisma.customerChannelConsent.create({
      data: {
        businessId,
        customerId,
        channel: 'whatsapp',
        state: 'granted',
        source: 'website_form',
        evidenceReference: `qa-form-${Date.now()}`,
        revision: Number(latestWhatsappConsent?.revision ?? 0) + 1,
        recordedByUserId: managerId,
      },
    });
    createMessage.mockReset();
    messageQueue.add.mockClear();
    createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'Hello, we wanted to check whether you still need any help.',
        },
      ],
      inputTokens: 20,
      outputTokens: 12,
      stopReason: 'end_turn',
    });
  });

  afterEach(async () => {
    await prisma.message.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    const businessIds = [businessId, foreignBusinessId];
    await prisma.customerChannelConsent.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.actionItemState.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.customerFollowUpTask.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.messageDraft.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.customer.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.businessUser.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [managerId, staffId] } },
    });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  const taskInput = (
    idempotencyKey: string,
    extra: Partial<{
      title: string;
      reason: string;
      priority: 'urgent' | 'normal' | 'low';
      dueAt: string;
      assigneeStaffId: string;
    }> = {},
  ) => ({
    title: 'Call about next booking',
    reason: 'The completed-order activity changed and needs a human review.',
    priority: 'normal' as const,
    idempotencyKey,
    ...extra,
  });

  it('creates one audited task on replay and exposes the same real record in Action Center', async () => {
    const input = taskInput('follow-up-task-key-1', {
      assigneeStaffId: staffMembershipId,
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const [first, replay] = await Promise.all([
      service.createTask(businessId, managerId, customerId, input),
      service.createTask(businessId, managerId, customerId, input),
    ]);
    expect(first.id).toBe(replay.id);
    expect(
      await prisma.customerFollowUpTask.count({ where: { businessId } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'CustomerFollowUpTask',
          action: 'customer_agent.follow_up_task_created',
        },
      }),
    ).toBe(1);
    cls.set(CLS_KEY_ROLE, Role.owner);
    const result = await actionCenter.list(businessId, Role.owner, null, {});
    expect(result.items).toContainEqual(
      expect.objectContaining({
        id: `customer_follow_up:${first.id}`,
        type: 'customer_follow_up',
        deepLink: `/customers/${customerId}`,
        assigneeStaffId: staffMembershipId,
      }),
    );
    expect(await service.listTasks(customerId)).toHaveLength(1);
  });

  it('creates one internal task from a current failed-delivery agent review and never sends a message', async () => {
    const order = await prisma.order.create({
      data: {
        business: { connect: { id: businessId } },
        customer: { connect: { id: customerId } },
        orderNo: Number(String(Date.now()).slice(-8)),
      },
    });
    const delivery = await prisma.delivery.create({
      data: {
        business: { connect: { id: businessId } },
        order: { connect: { id: order.id } },
        status: 'failed',
        addressLine: 'Private task fixture address',
        failureReason: 'Private task fixture reason',
      },
      select: { id: true, updatedAt: true },
    });
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'customer_intelligence',
        agentVersion: '1.0.0',
        moduleId: '7',
        triggerType: 'event',
        status: 'completed',
        inputRefs: [
          {
            eventId: `delivery-failed:${delivery.id}:${delivery.updatedAt.toISOString()}`,
            sourceModule: 'delivery',
            entityType: 'Delivery',
            entityId: delivery.id,
            occurredAt: delivery.updatedAt.toISOString(),
            entityVersion: delivery.updatedAt.toISOString(),
            schemaVersion: 1,
            correlationId: `delivery-failed:${delivery.id}:${delivery.updatedAt.toISOString()}`,
          },
        ],
        output: {},
        policyResult: {},
        finishedAt: new Date(),
      },
      select: { id: true },
    });
    const recommendation = await prisma.specialistAgentRecommendation.create({
      data: {
        businessId,
        runId: run.id,
        agentKey: 'customer_intelligence',
        title: 'Review customer follow-up after failed delivery',
        summary: 'Review contact context before any follow-up.',
        classification: 'recommendation',
        details: {},
        assumptions: [],
        missingData: [],
        confidenceMethod: 'not_available',
        riskTier: 'low',
        evidence: {
          create: {
            businessId,
            runId: run.id,
            sourceType: 'canonical_service',
            resourceType: 'delivery_contact_context',
            resourceId: delivery.id,
            fieldRefs: ['Delivery.status', 'Delivery.updatedAt'],
            observedValues: {},
            observedAt: new Date(),
            freshness: 'fresh',
          },
        },
      },
      select: { id: true },
    });
    const messagesBefore = await prisma.message.count({
      where: { businessId },
    });

    try {
      const [proposal, proposalReplay] = await Promise.all([
        service.proposeTaskFromRecommendation(
          businessId,
          managerId,
          recommendation.id,
        ),
        service.proposeTaskFromRecommendation(
          businessId,
          managerId,
          recommendation.id,
        ),
      ]);
      expect(proposal.id).toBe(proposalReplay.id);
      expect(proposal).toMatchObject({
        actionType: 'customer_follow_up_task',
        state: 'approval_required',
        expectedVersion: 1,
      });
      expect(
        await prisma.customerFollowUpTask.count({
          where: {
            businessId,
            idempotencyKey: { startsWith: 'customer-agent-delivery-failed:' },
          },
        }),
      ).toBe(0);
      const savedProposal = await prisma.specialistAgentAction.findFirstOrThrow(
        {
          where: { id: proposal.id, businessId },
          select: { proposedPayload: true, evidenceRefs: true },
        },
      );
      expect(JSON.stringify(savedProposal)).not.toContain(customerId);
      expect(JSON.stringify(savedProposal)).not.toContain(
        'Private task fixture address',
      );
      expect(JSON.stringify(savedProposal)).not.toContain(
        'Private task fixture reason',
      );

      const [task, replay] = await Promise.all([
        service.createTaskFromRecommendation(
          businessId,
          managerId,
          recommendation.id,
        ),
        service.createTaskFromRecommendation(
          businessId,
          managerId,
          recommendation.id,
        ),
      ]);
      expect(task.id).toBe(replay.id);
      expect(task).toMatchObject({
        customerId,
        title: 'Follow up on failed delivery',
        status: 'open',
      });
      expect(
        await prisma.auditLog.findFirst({
          where: {
            businessId,
            action: 'customer_agent.follow_up_task_created',
            entityId: task.id,
          },
          select: { after: true },
        }),
      ).toMatchObject({
        after: {
          source: 'customer_intelligence_failed_delivery_review',
          sourceRecommendationId: recommendation.id,
          containsMessageContent: false,
        },
      });
      expect(await prisma.message.count({ where: { businessId } })).toBe(
        messagesBefore,
      );

      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { status: 'delivered' },
      });
      await expect(
        service.createTaskFromRecommendation(
          businessId,
          managerId,
          recommendation.id,
        ),
      ).rejects.toMatchObject({
        response: { code: 'CUSTOMER_AGENT_FOLLOW_UP_SOURCE_STALE' },
      });
    } finally {
      await prisma.delivery.deleteMany({
        where: { id: delivery.id, businessId },
      });
      await prisma.order.deleteMany({ where: { id: order.id, businessId } });
      await prisma.specialistAgentRun.deleteMany({
        where: { id: run.id, businessId },
      });
    }
  });

  it('creates idempotent human tasks from current appointment no-show and cancellation reviews', async () => {
    const stamp = Date.now();
    const serviceProduct = await prisma.product.create({
      data: {
        businessId,
        kind: 'service',
        name: `Appointment follow-up fixture ${stamp}`,
        durationMin: 30,
      },
    });
    const cases = [
      {
        status: 'no_show' as const,
        resourceType: 'appointment_no_show_contact_context',
        title: 'Review follow-up after appointment no-show',
        auditSource: 'customer_intelligence_appointment_no_show_review',
      },
      {
        status: 'cancelled' as const,
        resourceType: 'appointment_cancellation_contact_context',
        title: 'Review follow-up after appointment cancellation',
        auditSource: 'customer_intelligence_appointment_cancelled_review',
      },
    ];

    try {
      for (const [index, testCase] of cases.entries()) {
        const appointment = await prisma.appointment.create({
          data: {
            businessId,
            customerId,
            serviceId: serviceProduct.id,
            startsAt: new Date(`2026-11-${10 + index}T10:00:00Z`),
            endsAt: new Date(`2026-11-${10 + index}T10:30:00Z`),
            status: testCase.status,
          },
          select: { id: true, updatedAt: true },
        });
        const run = await prisma.specialistAgentRun.create({
          data: {
            businessId,
            agentKey: 'customer_intelligence',
            agentVersion: '1.0.0',
            moduleId: '7',
            triggerType: 'event',
            status: 'completed',
            inputRefs: [
              {
                eventId: `appointment-review:${appointment.id}:${appointment.updatedAt.toISOString()}`,
                sourceModule: 'bookings',
                entityType: 'Appointment',
                entityId: appointment.id,
                occurredAt: appointment.updatedAt.toISOString(),
                entityVersion: appointment.updatedAt.toISOString(),
                schemaVersion: 1,
                correlationId: `appointment-review:${appointment.id}:${appointment.updatedAt.toISOString()}`,
              },
            ],
            output: {},
            policyResult: {},
            finishedAt: new Date(),
          },
          select: { id: true },
        });
        const recommendation =
          await prisma.specialistAgentRecommendation.create({
            data: {
              businessId,
              runId: run.id,
              agentKey: 'customer_intelligence',
              title: testCase.title,
              summary:
                'Review the current customer context before any follow-up.',
              classification: 'recommendation',
              details: {},
              assumptions: [],
              missingData: [],
              confidenceMethod: 'not_available',
              riskTier: 'low',
              evidence: {
                create: {
                  businessId,
                  runId: run.id,
                  sourceType: 'canonical_service',
                  resourceType: testCase.resourceType,
                  resourceId: appointment.id,
                  fieldRefs: ['Appointment.status', 'Appointment.updatedAt'],
                  observedValues: {},
                  observedAt: new Date(),
                  freshness: 'fresh',
                },
              },
            },
            select: { id: true },
          });

        const [task, replay] = await Promise.all([
          service.createTaskFromRecommendation(
            businessId,
            managerId,
            recommendation.id,
          ),
          service.createTaskFromRecommendation(
            businessId,
            managerId,
            recommendation.id,
          ),
        ]);
        expect(task.id).toBe(replay.id);
        expect(task).toMatchObject({ customerId, title: testCase.title });
        expect(
          await prisma.auditLog.findFirst({
            where: {
              businessId,
              action: 'customer_agent.follow_up_task_created',
              entityId: task.id,
            },
            select: { after: true },
          }),
        ).toMatchObject({
          after: {
            source: testCase.auditSource,
            sourceRecommendationId: recommendation.id,
            containsMessageContent: false,
          },
        });

        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: 'confirmed', updatedAt: new Date(Date.now() + 5000) },
        });
        await expect(
          service.createTaskFromRecommendation(
            businessId,
            managerId,
            recommendation.id,
          ),
        ).rejects.toMatchObject({
          response: { code: 'CUSTOMER_AGENT_FOLLOW_UP_SOURCE_STALE' },
        });
        await prisma.specialistAgentRun.deleteMany({
          where: { id: run.id, businessId },
        });
        await prisma.appointment.deleteMany({
          where: { id: appointment.id, businessId },
        });
      }
    } finally {
      await prisma.product.deleteMany({
        where: { id: serviceProduct.id, businessId },
      });
    }
  });

  it('binds idempotency keys to an exact task payload and tenant', async () => {
    await service.createTask(
      businessId,
      managerId,
      customerId,
      taskInput('follow-up-task-key-2'),
    );
    await expect(
      service.createTask(
        businessId,
        managerId,
        customerId,
        taskInput('follow-up-task-key-2', { priority: 'urgent' }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_FOLLOW_UP_IDEMPOTENCY_CONFLICT' },
    });
    await expect(
      service.createTask(
        businessId,
        managerId,
        foreignCustomerId,
        taskInput('follow-up-task-key-3'),
      ),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_NOT_FOUND' } });
  });

  it('refuses new agent records for an erased customer', async () => {
    const erased = await prisma.customer.create({
      data: {
        businessId,
        name: 'QA Erased Agent Customer',
        phone: `+15555${String(Date.now()).slice(-6)}04`,
        consentMarketing: false,
        optedOut: true,
      },
    });
    await prisma.customer.update({
      where: { id: erased.id },
      data: { name: 'Erased Customer', phone: `erased-${erased.id}` },
    });

    await expect(
      service.createTask(
        businessId,
        managerId,
        erased.id,
        taskInput('erased-customer-task'),
      ),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_AGENT_ERASED' } });
    await expect(
      service.createMessageDraft(businessId, managerId, erased.id, {
        body: 'This must not persist',
        idempotencyKey: 'erased-customer-draft',
      }),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_AGENT_ERASED' } });
    expect(
      await prisma.customerFollowUpTask.count({
        where: { businessId, customerId: erased.id },
      }),
    ).toBe(0);
    expect(
      await prisma.messageDraft.count({
        where: { businessId, customerId: erased.id },
      }),
    ).toBe(0);
  });

  it('serializes a concurrent follow-up write with customer erasure', async () => {
    const concurrent = await prisma.customer.create({
      data: {
        businessId,
        name: 'QA Concurrent Erasure Customer',
        phone: `+15555${String(Date.now()).slice(-6)}05`,
      },
    });

    const [taskResult, eraseResult] = await Promise.allSettled([
      service.createTask(
        businessId,
        managerId,
        concurrent.id,
        taskInput('concurrent-erasure-task'),
      ),
      customers.erase(concurrent.id, concurrent.phone),
    ]);

    expect(eraseResult.status).toBe('fulfilled');
    if (taskResult.status === 'rejected') {
      expect(taskResult.reason).toMatchObject({
        response: { code: 'CUSTOMER_AGENT_ERASED' },
      });
    }
    const saved = await prisma.customer.findUniqueOrThrow({
      where: { id: concurrent.id },
    });
    expect(saved.phone).toBe(`erased-${concurrent.id}`);
    expect(
      await prisma.customerFollowUpTask.count({
        where: { businessId, customerId: concurrent.id },
      }),
    ).toBe(0);
  });

  it('lets a manager and only the assigned active staff member complete a task; generic dismissal is refused', async () => {
    const task = await service.createTask(
      businessId,
      managerId,
      customerId,
      taskInput('follow-up-task-key-4', { assigneeStaffId: staffMembershipId }),
    );
    await expect(
      actionCenter.complete(businessId, `customer_follow_up:${task.id}`),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_FOLLOW_UP_REQUIRES_CRM_ACTION' },
    });
    cls.set(CLS_KEY_ROLE, Role.staff);
    cls.set(CLS_KEY_USER_ID, staffId);
    await expect(
      service.completeTask(businessId, managerId, task.id),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_FOLLOW_UP_FORBIDDEN' },
    });
    const completed = await service.completeTask(
      businessId,
      staffId,
      task.id,
      'contacted',
    );
    expect(completed).toMatchObject({
      status: 'completed',
      completedByUserId: staffId,
      completionOutcome: 'contacted',
    });
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(
      await prisma.customerFollowUpTask.count({
        where: { id: task.id, status: 'completed' },
      }),
    ).toBe(1);
    await expect(
      service.completeTask(businessId, staffId, task.id, 'no_answer'),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_FOLLOW_UP_OUTCOME_ALREADY_RECORDED' },
    });

    cls.set(CLS_KEY_ROLE, Role.manager);
    cls.set(CLS_KEY_USER_ID, managerId);
    const noOutcomeTask = await service.createTask(
      businessId,
      managerId,
      customerId,
      taskInput('follow-up-task-key-5'),
    );
    await service.completeTask(businessId, managerId, noOutcomeTask.id);
    await expect(
      service.followUpOutcomeSummary(businessId),
    ).resolves.toMatchObject({
      windowDays: 90,
      completedCount: 2,
      recordedCount: 1,
      notRecordedCount: 1,
      outcomes: { contacted: 1, no_answer: 0 },
    });
    const completionAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        businessId,
        entity: 'CustomerFollowUpTask',
        entityId: task.id,
        action: 'customer_agent.follow_up_task_completed',
      },
      select: { after: true },
    });
    expect(completionAudit.after).toMatchObject({
      completionOutcome: 'contacted',
      providerConfirmed: false,
    });
  });

  it('stores a canonical draft without creating or queuing a Message and refuses opted-out customers', async () => {
    const input = {
      body: 'Hello, please contact us if you would like to plan your next visit.',
      idempotencyKey: 'customer-draft-key-1',
    };
    const first = await service.createMessageDraft(
      businessId,
      managerId,
      customerId,
      input,
    );
    const replay = await service.createMessageDraft(
      businessId,
      managerId,
      customerId,
      input,
    );
    expect(first.id).toBe(replay.id);
    expect(first).toMatchObject({
      status: 'draft',
      body: input.body,
    });
    expect(await service.listMessageDrafts(customerId)).toHaveLength(1);
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'MessageDraft',
          action: 'customer_agent.message_draft_created',
        },
      }),
    ).toBe(1);
    await expect(
      service.createMessageDraft(businessId, managerId, customerId, {
        ...input,
        body: 'Different text.',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_MESSAGE_DRAFT_IDEMPOTENCY_CONFLICT' },
    });
    await expect(
      service.createMessageDraft(businessId, managerId, optedOutCustomerId, {
        ...input,
        idempotencyKey: 'customer-draft-key-opted-out',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_MESSAGE_DRAFT_CONSENT_REQUIRED' },
    });
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
  });

  it('generates an idempotent AI draft without sending customer data or creating a Message', async () => {
    const task = await service.createTask(
      businessId,
      managerId,
      customerId,
      taskInput('customer-ai-linked-follow-up-task'),
    );
    const input = {
      purpose: 'support_follow_up' as const,
      idempotencyKey: 'customer-ai-draft-key-1',
      followUpTaskId: task.id,
    };
    const first = await service.generateMessageDraft(
      businessId,
      managerId,
      customerId,
      input,
    );
    const replay = await service.generateMessageDraft(
      businessId,
      managerId,
      customerId,
      input,
    );
    expect(first.id).toBe(replay.id);
    expect(first).toMatchObject({
      status: 'draft',
      body: 'Hello, we wanted to check whether you still need any help.',
      generatedByAgent: true,
      followUpTaskId: task.id,
    });
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createMessage.mock.calls[0][0]).toBe(businessId);
    expect(createMessage.mock.calls[0][1]).toBe('customer_agent');
    expect(createMessage.mock.calls[0][5]).toBeTruthy();
    const specialistRun = await prisma.specialistAgentRun.findUniqueOrThrow({
      where: { id: createMessage.mock.calls[0][5] },
      include: { aiCallLogs: true },
    });
    expect(specialistRun).toMatchObject({
      agentKey: 'customer_intelligence',
      agentVersion: '1.0.0',
      moduleId: '7',
      status: 'completed',
      initiatedByUserId: managerId,
      errorCode: null,
    });
    expect(specialistRun.output).toMatchObject({
      action: 'customer_message_draft_created',
      messageDraftId: first.id,
      purpose: input.purpose,
      sent: false,
      providerInputContainsCustomerData: false,
    });
    expect(JSON.stringify(specialistRun.inputRefs)).not.toContain(customerId);
    expect(JSON.stringify(specialistRun.output)).not.toContain(first.body);
    expect(specialistRun.aiCallLogs).toHaveLength(0);
    const providerParams = JSON.stringify(createMessage.mock.calls[0][2]);
    for (const privateValue of [
      'QA Follow-up Customer',
      customerPhone,
      '@example.test',
      customerId,
    ]) {
      expect(providerParams).not.toContain(privateValue);
    }
    expect(providerParams).toContain('support');
    expect(await service.listMessageDrafts(customerId)).toContainEqual(
      expect.objectContaining({
        id: first.id,
        body: first.body,
        followUpTaskId: task.id,
      }),
    );
    expect(await service.listTasks(customerId)).toContainEqual(
      expect.objectContaining({
        id: task.id,
        linkedMessages: [
          expect.objectContaining({
            messageDraftId: first.id,
            draftStatus: 'draft',
            messageStatus: null,
            providerDeliveryConfirmed: false,
          }),
        ],
      }),
    );
    const reviewed = await service.updateMessageDraft(
      businessId,
      managerId,
      customerId,
      first.id,
      { body: 'Hello, please reply if you still need any help.' },
    );
    expect(reviewed).toMatchObject({
      id: first.id,
      body: 'Hello, please reply if you still need any help.',
      generatedByAgent: true,
    });
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'MessageDraft',
          action: 'customer_agent.ai_message_draft_created',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'MessageDraft',
          action: 'customer_agent.message_draft_updated',
        },
      }),
    ).toBe(1);
  });

  it('links a staff draft to an open task and reflects only canonical provider delivery status', async () => {
    const task = await service.createTask(
      businessId,
      managerId,
      customerId,
      taskInput('customer-manual-linked-follow-up-task'),
    );
    const draft = await service.createMessageDraft(
      businessId,
      managerId,
      customerId,
      {
        body: 'Please reply if you still need help.',
        idempotencyKey: 'customer-manual-linked-message-draft',
        followUpTaskId: task.id,
      },
    );
    expect(draft.followUpTaskId).toBe(task.id);
    expect(await service.listTasks(customerId)).toContainEqual(
      expect.objectContaining({
        id: task.id,
        linkedMessages: [
          expect.objectContaining({
            messageDraftId: draft.id,
            draftStatus: 'draft',
            messageStatus: null,
            providerDeliveryConfirmed: false,
          }),
        ],
      }),
    );

    await service.queueMessageDraft(
      businessId,
      managerId,
      customerId,
      draft.id,
    );
    let linkedTask = (await service.listTasks(customerId)).find(
      (candidate) => candidate.id === task.id,
    );
    expect(linkedTask?.linkedMessages[0]).toMatchObject({
      draftStatus: 'queued',
      messageStatus: 'queued',
      providerDeliveryConfirmed: false,
    });

    await prisma.message.update({
      where: {
        businessId_idempotencyKey: {
          businessId,
          idempotencyKey: `customer-agent-draft:${draft.id}`,
        },
      },
      data: { status: 'delivered' },
    });
    linkedTask = (await service.listTasks(customerId)).find(
      (candidate) => candidate.id === task.id,
    );
    expect(linkedTask?.linkedMessages[0]).toMatchObject({
      draftStatus: 'queued',
      messageStatus: 'delivered',
      providerDeliveryConfirmed: true,
    });
  });

  it('refuses to link a draft to another customer or a closed task', async () => {
    const anotherCustomer = await prisma.customer.create({
      data: {
        businessId,
        name: 'QA Other Follow-up Customer',
        phone: `+15555${String(Date.now()).slice(-6)}06`,
        consentMarketing: true,
      },
    });
    const otherCustomerTask = await service.createTask(
      businessId,
      managerId,
      anotherCustomer.id,
      taskInput('customer-link-wrong-customer-task'),
    );
    await expect(
      service.createMessageDraft(businessId, managerId, customerId, {
        body: 'This must not link across customers.',
        idempotencyKey: 'customer-link-wrong-customer-draft',
        followUpTaskId: otherCustomerTask.id,
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_FOLLOW_UP_NOT_FOUND' },
    });

    const closedTask = await service.createTask(
      businessId,
      managerId,
      customerId,
      taskInput('customer-link-closed-task'),
    );
    await service.completeTask(businessId, managerId, closedTask.id);
    await expect(
      service.createMessageDraft(businessId, managerId, customerId, {
        body: 'This must not link to a completed task.',
        idempotencyKey: 'customer-link-closed-task-draft',
        followUpTaskId: closedTask.id,
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_FOLLOW_UP_NOT_OPEN' },
    });
  });

  it('previews and queues a reviewed customer draft through the canonical send gate exactly once', async () => {
    const draft = await service.createMessageDraft(
      businessId,
      managerId,
      customerId,
      {
        body: 'Hi, reply if you still need help with your booking.',
        idempotencyKey: 'customer-agent-send-draft-create',
      },
    );

    const preview = await service.previewMessageDraft(
      businessId,
      customerId,
      draft.id,
    );
    expect(preview).toMatchObject({
      category: 'marketing',
      renderedText: 'Hi, reply if you still need help with your booking.',
      deliveryState: 'not_queued',
    });
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(messageQueue.add).not.toHaveBeenCalled();

    const queued = await service.queueMessageDraft(
      businessId,
      managerId,
      customerId,
      draft.id,
    );
    expect(queued).toMatchObject({ queued: true, messageStatus: 'queued' });
    expect(messageQueue.add).toHaveBeenCalledTimes(1);
    const message = await prisma.message.findFirstOrThrow({
      where: {
        businessId,
        customerId,
        idempotencyKey: `customer-agent-draft:${draft.id}`,
      },
    });
    expect(message).toMatchObject({
      category: 'marketing',
      templateKey: 'campaign',
      customBody: 'Hi, reply if you still need help with your booking.',
      status: 'queued',
    });

    const replay = await service.queueMessageDraft(
      businessId,
      managerId,
      customerId,
      draft.id,
    );
    expect(replay).toMatchObject({
      messageId: message.id,
      messageStatus: 'queued',
    });
    expect(messageQueue.add).toHaveBeenCalledTimes(1);
    expect(await service.listMessageDrafts(customerId)).toContainEqual(
      expect.objectContaining({
        id: draft.id,
        status: 'queued',
        messageStatus: 'queued',
      }),
    );
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'MessageDraft',
          entityId: draft.id,
          action: 'customer_agent.message_draft_queued',
        },
      }),
    ).toBe(1);
  });

  it('rechecks consent after preview and refuses to queue if consent is withdrawn', async () => {
    const draft = await service.createMessageDraft(
      businessId,
      managerId,
      customerId,
      {
        body: 'Please reply if you need further assistance.',
        idempotencyKey: 'customer-agent-consent-revoked-draft',
      },
    );
    await service.previewMessageDraft(businessId, customerId, draft.id);
    await prisma.customer.update({
      where: { id: customerId },
      data: { consentMarketing: false },
    });

    await expect(
      service.queueMessageDraft(businessId, managerId, customerId, draft.id),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_MESSAGE_DRAFT_CONSENT_REQUIRED' },
    });
    expect(
      await prisma.message.count({
        where: {
          businessId,
          idempotencyKey: `customer-agent-draft:${draft.id}`,
        },
      }),
    ).toBe(0);
    expect(messageQueue.add).not.toHaveBeenCalled();
    const refusalAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        businessId,
        entity: 'MessageDraft',
        entityId: draft.id,
        action: 'customer_agent.message_draft_queue_refused',
      },
    });
    expect(refusalAudit.after).toMatchObject({
      reasonCode: 'CUSTOMER_MESSAGE_DRAFT_CONSENT_REQUIRED',
      messageCreated: false,
      messageStatus: null,
      providerDeliveryConfirmed: false,
    });
    await prisma.customer.update({
      where: { id: customerId },
      data: { consentMarketing: true },
    });
  });

  it('refuses AI generation for opted-out customers and reports provider credit failures without saving a draft', async () => {
    await expect(
      service.generateMessageDraft(businessId, managerId, optedOutCustomerId, {
        purpose: 'feedback_request',
        idempotencyKey: 'customer-ai-draft-opted-out',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_MESSAGE_DRAFT_CONSENT_REQUIRED' },
    });
    expect(createMessage).not.toHaveBeenCalled();

    createMessage.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          error: {
            type: 'invalid_request_error',
            message: 'Your credit balance is too low. Add more credits.',
          },
        },
      },
    });
    const failedRunWindowStart = new Date();
    await expect(
      service.generateMessageDraft(businessId, managerId, customerId, {
        purpose: 'general_follow_up',
        idempotencyKey: 'customer-ai-draft-provider-offline',
      }),
    ).rejects.toMatchObject({
      response: { code: 'AI_PROVIDER_INSUFFICIENT_CREDIT' },
      message:
        'The AI provider account has insufficient credit. Ask the platform administrator to add credit before retrying. No message was saved or sent.',
    });
    const failedRun = await prisma.specialistAgentRun.findFirstOrThrow({
      where: {
        businessId,
        agentKey: 'customer_intelligence',
        createdAt: { gte: failedRunWindowStart },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(failedRun).toMatchObject({
      status: 'failed',
      errorCode: 'AI_PROVIDER_INSUFFICIENT_CREDIT',
      errorMessage:
        'The AI provider account has insufficient credit. Ask the platform administrator to add credit before retrying. No message was saved or sent.',
    });
    expect(
      await prisma.messageDraft.count({
        where: {
          businessId,
          sourceKey: `customer_agent:${customerId}:ai:customer-ai-draft-provider-offline`,
        },
      }),
    ).toBe(0);
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
  });

  it('prepares win-back drafts only after the canonical 60-day lapse threshold', async () => {
    await prisma.customer.update({
      where: { id: customerId },
      data: { lastVisitAt: new Date(Date.now() - 61 * 86_400_000) },
    });
    const input = {
      purpose: 'winback_follow_up' as const,
      idempotencyKey: 'customer-winback-draft-61-days',
    };
    const draft = await service.generateMessageDraft(
      businessId,
      managerId,
      customerId,
      input,
    );
    expect(draft).toMatchObject({ status: 'draft', generatedByAgent: true });
    expect(createMessage).toHaveBeenCalledTimes(1);
    const prompt = JSON.stringify(createMessage.mock.calls[0][2]);
    expect(prompt).toContain('respectful reactivation message');
    expect(prompt).not.toContain('QA Follow-up Customer');
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);

    await prisma.customer.update({
      where: { id: customerId },
      data: { lastVisitAt: new Date() },
    });
    await expect(
      service.generateMessageDraft(businessId, managerId, customerId, {
        purpose: 'winback_follow_up',
        idempotencyKey: 'customer-winback-draft-too-recent',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_WINBACK_NOT_LAPSED' },
    });
    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it('refuses writes after the agent or Customers module is disabled and rejects staff creation', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'agents.customerEnabled': false } },
    });
    await expect(
      service.createTask(
        businessId,
        managerId,
        customerId,
        taskInput('follow-up-task-disabled-agent'),
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_DISABLED' },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {}, disabledModules: ['customers'] },
    });
    await expect(
      service.createMessageDraft(businessId, managerId, customerId, {
        body: 'A draft that must not be saved.',
        idempotencyKey: 'customer-draft-disabled-module',
      }),
    ).rejects.toMatchObject({ response: { code: 'BUSINESS_MODULE_DISABLED' } });
    await prisma.business.update({
      where: { id: businessId },
      data: { disabledModules: [] },
    });
    cls.set(CLS_KEY_ROLE, Role.staff);
    cls.set(CLS_KEY_USER_ID, staffId);
    await expect(
      service.createTask(
        businessId,
        staffId,
        customerId,
        taskInput('follow-up-task-staff-denied'),
      ),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_AGENT_ACTION_FORBIDDEN' },
    });
  });
});
