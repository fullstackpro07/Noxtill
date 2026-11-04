import { ClsService } from 'nestjs-cls';
import { Job } from 'bullmq';
import { SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import {
  CUSTOMER_APPOINTMENT_CANCELLED_EVENT_JOB,
  CUSTOMER_DELIVERY_FAILED_EVENT_JOB,
  CUSTOMER_NO_SHOW_EVENT_JOB,
  CUSTOMER_ORDER_COMPLETED_EVENT_JOB,
} from '../common/agents/specialist-agent-events.constants';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { CustomerIntelligenceService } from '../customers/customer-intelligence.service';
import { CustomerAgentEventProcessor } from './customer-agent-event.processor';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }

  run<T>(callback: () => Promise<T>): Promise<T> {
    return callback();
  }
}

describe('CustomerAgentEventProcessor (MySQL)', () => {
  let prisma: PrismaService;
  let processor: CustomerAgentEventProcessor;
  const runAgent = jest.fn<
    Promise<SpecialistAgentRun>,
    [
      string,
      string | null,
      'current_business' | 'selected_branch',
      string | undefined,
      string | undefined,
      SpecialistAgentRunOptions,
    ]
  >();
  const reviewFailedDelivery = jest.fn<
    Promise<unknown>,
    [string, string, Date]
  >();
  const reviewNoShowAppointment = jest.fn<
    Promise<unknown>,
    [string, string, Date, string?]
  >();
  const reviewCancelledAppointment = jest.fn<
    Promise<unknown>,
    [string, string, Date, string?]
  >();
  const cls = new FakeClsService();
  const businessIds: string[] = [];
  const customerIds: string[] = [];
  const activityEventIds: string[] = [];
  const productIds: string[] = [];
  const appointmentIds: string[] = [];
  let failedDeliveryFixture: { id: string; updatedAt: Date } | undefined;
  const noShowFixtures: Array<{
    id: string;
    businessId: string;
    updatedAt: Date;
  }> = [];
  const cancelledFixtures: Array<{
    id: string;
    businessId: string;
    updatedAt: Date;
  }> = [];
  const completedOrderFixtures: Array<{
    id: string;
    businessId: string;
    createdAt: Date;
  }> = [];
  let pendingOrderFixture:
    { id: string; businessId: string; createdAt: Date } | undefined;

  beforeEach(() => {
    runAgent.mockClear();
    reviewFailedDelivery.mockClear();
    reviewNoShowAppointment.mockClear();
    reviewCancelledAppointment.mockClear();
  });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = `${Date.now()}-${process.pid}`;
    const optedIn = await prisma.business.create({
      data: {
        name: 'Customer Lapsed Event Opt-In Test',
        slug: `customer-lapsed-event-enabled-${stamp}`,
        policies: {
          'agents.customerEnabled': true,
          'agents.customerLapsedEventReviewEnabled': true,
          'agents.customerDeliveryFailedEventReviewEnabled': true,
          'agents.customerNoShowEventReviewEnabled': true,
          'agents.customerAppointmentCancelledEventReviewEnabled': true,
          'agents.customerCompletedSaleEventReviewEnabled': true,
        },
      },
    });
    const optedOut = await prisma.business.create({
      data: {
        name: 'Customer Lapsed Event Opt-Out Test',
        slug: `customer-lapsed-event-disabled-${stamp}`,
        policies: {
          'agents.customerEnabled': true,
          'agents.customerLapsedEventReviewEnabled': false,
          'agents.customerNoShowEventReviewEnabled': false,
          'agents.customerAppointmentCancelledEventReviewEnabled': false,
          'agents.customerCompletedSaleEventReviewEnabled': false,
        },
      },
    });
    businessIds.push(optedIn.id, optedOut.id);

    const customers = await Promise.all([
      prisma.customer.create({
        data: {
          businessId: optedIn.id,
          phone: `+1555${Date.now().toString().slice(-7)}01`,
          name: 'QA Lapsed Customer One',
          tags: ['Lapsed'],
        },
      }),
      prisma.customer.create({
        data: {
          businessId: optedIn.id,
          phone: `+1555${Date.now().toString().slice(-7)}02`,
          name: 'QA Lapsed Customer Two',
          tags: ['Lapsed'],
        },
      }),
      prisma.customer.create({
        data: {
          businessId: optedOut.id,
          phone: `+1555${Date.now().toString().slice(-7)}03`,
          name: 'QA Opted-Out Lapsed Customer',
          tags: ['Lapsed'],
        },
      }),
      prisma.customer.create({
        data: {
          businessId: optedIn.id,
          phone: `+1555${Date.now().toString().slice(-7)}04`,
          name: 'QA No Longer Lapsed Customer',
          tags: [],
        },
      }),
    ]);
    customerIds.push(...customers.map((customer) => customer.id));

    const serviceProducts = await Promise.all(
      [optedIn, optedOut].map((business) =>
        prisma.product.create({
          data: {
            businessId: business.id,
            kind: 'service',
            name: 'QA no-show review fixture',
            durationMin: 30,
          },
        }),
      ),
    );
    productIds.push(...serviceProducts.map((product) => product.id));
    const noShowAppointments = await Promise.all([
      prisma.appointment.create({
        data: {
          businessId: optedIn.id,
          serviceId: serviceProducts[0].id,
          customerId: customers[0].id,
          startsAt: new Date('2026-10-01T10:00:00Z'),
          endsAt: new Date('2026-10-01T10:30:00Z'),
          status: 'no_show',
        },
        select: { id: true, businessId: true, updatedAt: true },
      }),
      prisma.appointment.create({
        data: {
          businessId: optedOut.id,
          serviceId: serviceProducts[1].id,
          customerId: customers[2].id,
          startsAt: new Date('2026-10-02T10:00:00Z'),
          endsAt: new Date('2026-10-02T10:30:00Z'),
          status: 'no_show',
        },
        select: { id: true, businessId: true, updatedAt: true },
      }),
    ]);
    appointmentIds.push(
      ...noShowAppointments.map((appointment) => appointment.id),
    );
    noShowFixtures.push(...noShowAppointments);
    const cancelledAppointments = await Promise.all([
      prisma.appointment.create({
        data: {
          businessId: optedIn.id,
          serviceId: serviceProducts[0].id,
          customerId: customers[0].id,
          startsAt: new Date('2026-10-03T10:00:00Z'),
          endsAt: new Date('2026-10-03T10:30:00Z'),
          status: 'cancelled',
        },
        select: { id: true, businessId: true, updatedAt: true },
      }),
      prisma.appointment.create({
        data: {
          businessId: optedOut.id,
          serviceId: serviceProducts[1].id,
          customerId: customers[2].id,
          startsAt: new Date('2026-10-04T10:00:00Z'),
          endsAt: new Date('2026-10-04T10:30:00Z'),
          status: 'cancelled',
        },
        select: { id: true, businessId: true, updatedAt: true },
      }),
    ]);
    appointmentIds.push(
      ...cancelledAppointments.map((appointment) => appointment.id),
    );
    cancelledFixtures.push(...cancelledAppointments);

    const [firstLapsed, secondLapsed, optedOutLapsed, noLongerLapsed] =
      customers;
    if (!firstLapsed || !secondLapsed || !optedOutLapsed || !noLongerLapsed) {
      throw new Error('Expected all Customer Agent event fixtures');
    }
    const order = await prisma.order.create({
      data: {
        business: { connect: { id: optedIn.id } },
        customer: { connect: { id: firstLapsed.id } },
        orderNo: Number(String(Date.now()).slice(-8)),
        status: 'completed',
      },
      select: { id: true, businessId: true, createdAt: true, orderNo: true },
    });
    completedOrderFixtures.push(order);
    const optedOutOrder = await prisma.order.create({
      data: {
        businessId: optedOut.id,
        customerId: optedOutLapsed.id,
        orderNo: order.orderNo + 1,
        status: 'completed',
      },
      select: { id: true, businessId: true, createdAt: true },
    });
    completedOrderFixtures.push(optedOutOrder);
    pendingOrderFixture = await prisma.order.create({
      data: {
        businessId: optedIn.id,
        customerId: secondLapsed.id,
        orderNo: order.orderNo + 2,
        status: 'pending',
      },
      select: { id: true, businessId: true, createdAt: true },
    });
    failedDeliveryFixture = await prisma.delivery.create({
      data: {
        business: { connect: { id: optedIn.id } },
        order: { connect: { id: order.id } },
        status: 'failed',
        addressLine: 'QA private address must not enter agent output',
        failureReason: 'QA private failure reason must not enter agent output',
      },
      select: { id: true, updatedAt: true },
    });

    const events = await Promise.all(
      [
        { businessId: optedIn.id, customerId: firstLapsed.id },
        { businessId: optedIn.id, customerId: secondLapsed.id },
        { businessId: optedOut.id, customerId: optedOutLapsed.id },
        { businessId: optedIn.id, customerId: noLongerLapsed.id },
      ].map(({ businessId, customerId }) =>
        prisma.activityEvent.create({
          data: {
            businessId,
            type: 'customer_lapsed',
            description: 'QA customer lapsed event',
            entityType: 'Customer',
            entityId: customerId,
          },
        }),
      ),
    );
    activityEventIds.push(...events.map((event) => event.id));

    runAgent.mockImplementation(
      async (
        businessId: string,
        actorUserId: string | null,
        scope: 'current_business' | 'selected_branch',
        idempotencyKey: string | undefined,
        branchId: string | undefined,
        options: SpecialistAgentRunOptions,
      ) => {
        const triggerRef = options.triggerRef;
        if (!triggerRef || !idempotencyKey) {
          throw new Error('Expected customer-lapsed event options');
        }
        expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(businessId);
        expect(scope).toBe('current_business');
        expect(branchId).toBe(businessId);
        return prisma.specialistAgentRun.create({
          data: {
            businessId,
            agentKey: 'customer_intelligence',
            agentVersion: '1.0.0',
            moduleId: '7',
            triggerType: options.triggerType,
            status: 'completed',
            initiatedByUserId: actorUserId,
            idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey),
            idempotencyRequestHash: specialistAgentIdempotencyHash(
              triggerRef.eventId,
            ),
            inputRefs: [triggerRef],
          },
        });
      },
    );

    processor = new CustomerAgentEventProcessor(
      prisma,
      cls as unknown as ClsService,
      {
        run: runAgent,
        reviewFailedDelivery,
        reviewNoShowAppointment,
        reviewCancelledAppointment,
      } as unknown as CustomerIntelligenceService,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
  });

  afterAll(async () => {
    if (businessIds.length > 0) {
      await prisma.delivery.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.appointment.deleteMany({
        where: { id: { in: appointmentIds }, businessId: { in: businessIds } },
      });
      await prisma.order.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.specialistAgentRun.deleteMany({
        where: {
          businessId: { in: businessIds },
          agentKey: 'customer_intelligence',
        },
      });
      await prisma.activityEvent.deleteMany({
        where: {
          id: { in: activityEventIds },
          businessId: { in: businessIds },
        },
      });
      await prisma.product.deleteMany({
        where: { id: { in: productIds }, businessId: { in: businessIds } },
      });
      await prisma.customer.deleteMany({
        where: { id: { in: customerIds }, businessId: { in: businessIds } },
      });
      await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    }
    await prisma.$disconnect();
  });

  it('coalesces duplicate newly-lapsed events into one opted-in daily review', async () => {
    const businessId = businessIds[0];
    const firstEventId = activityEventIds[0];
    const secondEventId = activityEventIds[1];
    if (!businessId || !firstEventId || !secondEventId) {
      throw new Error('Expected opted-in customer-lapsed fixtures');
    }

    await processor.process({
      name: 'customer-lapsed',
      data: { businessId, activityEventId: firstEventId },
    } as Job<unknown>);
    await processor.process({
      name: 'customer-lapsed',
      data: { businessId, activityEventId: secondEventId },
    } as Job<unknown>);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const call = runAgent.mock.calls[0];
    if (!call) throw new Error('Expected the Customer agent to run');
    const [calledBusinessId, actorUserId, , idempotencyKey, , options] = call;
    expect(calledBusinessId).toBe(businessId);
    expect(actorUserId).toBeNull();
    expect(idempotencyKey).toMatch(
      new RegExp(`^customer-lapsed-daily:${businessId}:\\d{4}-\\d{2}-\\d{2}$`),
    );
    expect(options).toMatchObject({
      triggerType: 'event',
      includeAiSummary: false,
      triggerRef: {
        eventId: idempotencyKey,
        sourceModule: 'customers',
        entityType: 'Business',
        entityId: businessId,
        entityVersion: idempotencyKey?.split(':').at(-1),
      },
    });
    expect(JSON.stringify(options?.triggerRef)).not.toContain(firstEventId);
    expect(JSON.stringify(options?.triggerRef)).not.toContain(secondEventId);
    const saved = await prisma.specialistAgentRun.findFirstOrThrow({
      where: {
        businessId,
        agentKey: 'customer_intelligence',
        triggerType: 'event',
        idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey!),
      },
    });
    expect(saved.initiatedByUserId).toBeNull();
    expect(saved.inputRefs).toEqual([options.triggerRef]);
    expect(JSON.stringify(saved.inputRefs)).not.toContain(firstEventId);
    expect(JSON.stringify(saved.inputRefs)).not.toContain(secondEventId);
  });

  it('rejects opted-out, cross-tenant and no-longer-lapsed customer events', async () => {
    const optedOutBusinessId = businessIds[1];
    const optedOutEventId = activityEventIds[2];
    const enabledBusinessId = businessIds[0];
    const staleEventId = activityEventIds[3];
    if (
      !optedOutBusinessId ||
      !optedOutEventId ||
      !enabledBusinessId ||
      !staleEventId
    ) {
      throw new Error('Expected customer-lapsed rejection fixtures');
    }

    await processor.process({
      name: 'customer-lapsed',
      data: {
        businessId: optedOutBusinessId,
        activityEventId: optedOutEventId,
      },
    } as Job<unknown>);
    await processor.process({
      name: 'customer-lapsed',
      data: {
        businessId: optedOutBusinessId,
        activityEventId: activityEventIds[0],
      },
    } as Job<unknown>);
    await processor.process({
      name: 'customer-lapsed',
      data: { businessId: enabledBusinessId, activityEventId: staleEventId },
    } as Job<unknown>);

    const erasedFixtureId = customerIds[0];
    if (!erasedFixtureId) throw new Error('Expected a lapsed customer fixture');
    const erasedFixture = await prisma.customer.findFirstOrThrow({
      where: { id: erasedFixtureId, businessId: enabledBusinessId },
      select: { id: true, phone: true },
    });
    try {
      await prisma.customer.update({
        where: { id: erasedFixture.id },
        data: { phone: `erased-${erasedFixture.id}` },
      });
      await processor.process({
        name: 'customer-lapsed',
        data: {
          businessId: enabledBusinessId,
          activityEventId: activityEventIds[0],
        },
      } as Job<unknown>);
    } finally {
      await prisma.customer.update({
        where: { id: erasedFixture.id },
        data: { phone: erasedFixture.phone },
      });
    }

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('rechecks opt-in, tenant and exact failure timestamp before invoking the CRM review', async () => {
    reviewFailedDelivery.mockClear();
    const businessId = businessIds[0];
    if (!businessId || !failedDeliveryFixture) {
      throw new Error('Expected opted-in failed-delivery fixture');
    }
    const jobData = {
      businessId,
      deliveryId: failedDeliveryFixture.id,
      failedAt: failedDeliveryFixture.updatedAt.toISOString(),
    };

    await processor.process({
      name: CUSTOMER_DELIVERY_FAILED_EVENT_JOB,
      data: jobData,
    } as Job<unknown>);
    expect(reviewFailedDelivery).toHaveBeenCalledTimes(1);
    expect(reviewFailedDelivery).toHaveBeenCalledWith(
      businessId,
      failedDeliveryFixture.id,
      failedDeliveryFixture.updatedAt,
      `customer:delivery-failed:${failedDeliveryFixture.id}:${failedDeliveryFixture.updatedAt.toISOString()}:${businessId}`,
    );
    expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(businessId);

    await processor.process({
      name: CUSTOMER_DELIVERY_FAILED_EVENT_JOB,
      data: {
        ...jobData,
        failedAt: new Date(
          failedDeliveryFixture.updatedAt.getTime() + 1_000,
        ).toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: CUSTOMER_DELIVERY_FAILED_EVENT_JOB,
      data: { ...jobData, businessId: businessIds[1] },
    } as Job<unknown>);
    expect(reviewFailedDelivery).toHaveBeenCalledTimes(1);

    const linkedCustomerId = customerIds[0];
    if (!linkedCustomerId) throw new Error('Expected failed-delivery customer');
    const linkedCustomer = await prisma.customer.findFirstOrThrow({
      where: { id: linkedCustomerId, businessId },
      select: { id: true, phone: true },
    });
    try {
      await prisma.customer.update({
        where: { id: linkedCustomer.id },
        data: { phone: `erased-${linkedCustomer.id}` },
      });
      await processor.process({
        name: CUSTOMER_DELIVERY_FAILED_EVENT_JOB,
        data: jobData,
      } as Job<unknown>);
      expect(reviewFailedDelivery).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.customer.update({
        where: { id: linkedCustomer.id },
        data: { phone: linkedCustomer.phone },
      });
    }
  });

  it('only forwards a current, same-business no-show when the owner opted in', async () => {
    const optedIn = noShowFixtures.find(
      (appointment) => appointment.businessId === businessIds[0],
    );
    const optedOut = noShowFixtures.find(
      (appointment) => appointment.businessId === businessIds[1],
    );
    if (!optedIn || !optedOut) {
      throw new Error('Expected opted-in and opted-out no-show fixtures');
    }

    await processor.process({
      name: CUSTOMER_NO_SHOW_EVENT_JOB,
      data: {
        businessId: optedIn.businessId,
        appointmentId: optedIn.id,
        noShowAt: optedIn.updatedAt.toISOString(),
      },
    } as Job<unknown>);
    expect(reviewNoShowAppointment).toHaveBeenCalledTimes(1);
    expect(reviewNoShowAppointment).toHaveBeenCalledWith(
      optedIn.businessId,
      optedIn.id,
      optedIn.updatedAt,
      `customer:appointment-no-show:${optedIn.id}:${optedIn.updatedAt.toISOString()}:${optedIn.businessId}`,
    );
    expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(optedIn.businessId);

    await processor.process({
      name: CUSTOMER_NO_SHOW_EVENT_JOB,
      data: {
        businessId: optedIn.businessId,
        appointmentId: optedIn.id,
        noShowAt: new Date(optedIn.updatedAt.getTime() + 1_000).toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: CUSTOMER_NO_SHOW_EVENT_JOB,
      data: {
        businessId: optedOut.businessId,
        appointmentId: optedOut.id,
        noShowAt: optedOut.updatedAt.toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: CUSTOMER_NO_SHOW_EVENT_JOB,
      data: {
        businessId: optedOut.businessId,
        appointmentId: optedIn.id,
        noShowAt: optedIn.updatedAt.toISOString(),
      },
    } as Job<unknown>);

    expect(reviewNoShowAppointment).toHaveBeenCalledTimes(1);

    const linkedCustomerId = customerIds[0];
    if (!linkedCustomerId) throw new Error('Expected no-show customer');
    const linkedCustomer = await prisma.customer.findFirstOrThrow({
      where: { id: linkedCustomerId, businessId: optedIn.businessId },
      select: { id: true, phone: true },
    });
    try {
      await prisma.customer.update({
        where: { id: linkedCustomer.id },
        data: { phone: `erased-${linkedCustomer.id}` },
      });
      await processor.process({
        name: CUSTOMER_NO_SHOW_EVENT_JOB,
        data: {
          businessId: optedIn.businessId,
          appointmentId: optedIn.id,
          noShowAt: optedIn.updatedAt.toISOString(),
        },
      } as Job<unknown>);
      expect(reviewNoShowAppointment).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.customer.update({
        where: { id: linkedCustomer.id },
        data: { phone: linkedCustomer.phone },
      });
    }
  });

  it('only forwards a current, same-business cancellation when the owner opted in', async () => {
    const optedIn = cancelledFixtures.find(
      (appointment) => appointment.businessId === businessIds[0],
    );
    const optedOut = cancelledFixtures.find(
      (appointment) => appointment.businessId === businessIds[1],
    );
    if (!optedIn || !optedOut) {
      throw new Error('Expected opted-in and opted-out cancellation fixtures');
    }

    await processor.process({
      name: CUSTOMER_APPOINTMENT_CANCELLED_EVENT_JOB,
      data: {
        businessId: optedIn.businessId,
        appointmentId: optedIn.id,
        cancelledAt: optedIn.updatedAt.toISOString(),
      },
    } as Job<unknown>);
    expect(reviewCancelledAppointment).toHaveBeenCalledTimes(1);
    expect(reviewCancelledAppointment).toHaveBeenCalledWith(
      optedIn.businessId,
      optedIn.id,
      optedIn.updatedAt,
      `customer:appointment-cancelled:${optedIn.id}:${optedIn.updatedAt.toISOString()}:${optedIn.businessId}`,
    );
    expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(optedIn.businessId);

    await processor.process({
      name: CUSTOMER_APPOINTMENT_CANCELLED_EVENT_JOB,
      data: {
        businessId: optedIn.businessId,
        appointmentId: optedIn.id,
        cancelledAt: new Date(
          optedIn.updatedAt.getTime() + 1_000,
        ).toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: CUSTOMER_APPOINTMENT_CANCELLED_EVENT_JOB,
      data: {
        businessId: optedOut.businessId,
        appointmentId: optedOut.id,
        cancelledAt: optedOut.updatedAt.toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: CUSTOMER_APPOINTMENT_CANCELLED_EVENT_JOB,
      data: {
        businessId: optedOut.businessId,
        appointmentId: optedIn.id,
        cancelledAt: optedIn.updatedAt.toISOString(),
      },
    } as Job<unknown>);
    expect(reviewCancelledAppointment).toHaveBeenCalledTimes(1);

    const linkedCustomerId = customerIds[0];
    if (!linkedCustomerId) throw new Error('Expected cancellation customer');
    const linkedCustomer = await prisma.customer.findFirstOrThrow({
      where: { id: linkedCustomerId, businessId: optedIn.businessId },
      select: { id: true, phone: true },
    });
    try {
      await prisma.customer.update({
        where: { id: linkedCustomer.id },
        data: { phone: `erased-${linkedCustomer.id}` },
      });
      await processor.process({
        name: CUSTOMER_APPOINTMENT_CANCELLED_EVENT_JOB,
        data: {
          businessId: optedIn.businessId,
          appointmentId: optedIn.id,
          cancelledAt: optedIn.updatedAt.toISOString(),
        },
      } as Job<unknown>);
      expect(reviewCancelledAppointment).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.customer.update({
        where: { id: linkedCustomer.id },
        data: { phone: linkedCustomer.phone },
      });
    }
  });

  it('rechecks completed customer sale state, opt-in and tenant, then coalesces same-day reviews', async () => {
    const optedIn = completedOrderFixtures.find(
      (order) => order.businessId === businessIds[0],
    );
    const optedOut = completedOrderFixtures.find(
      (order) => order.businessId === businessIds[1],
    );
    if (!optedIn || !optedOut || !pendingOrderFixture) {
      throw new Error('Expected completed-sale review fixtures');
    }

    await processor.process({
      name: CUSTOMER_ORDER_COMPLETED_EVENT_JOB,
      data: {
        businessId: optedOut.businessId,
        orderId: optedOut.id,
        occurredAt: optedOut.createdAt.toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: CUSTOMER_ORDER_COMPLETED_EVENT_JOB,
      data: {
        businessId: optedIn.businessId,
        orderId: optedOut.id,
        occurredAt: optedOut.createdAt.toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: CUSTOMER_ORDER_COMPLETED_EVENT_JOB,
      data: {
        businessId: pendingOrderFixture.businessId,
        orderId: pendingOrderFixture.id,
        occurredAt: pendingOrderFixture.createdAt.toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: CUSTOMER_ORDER_COMPLETED_EVENT_JOB,
      data: {
        businessId: optedIn.businessId,
        orderId: optedIn.id,
        occurredAt: new Date(optedIn.createdAt.getTime() + 1_000).toISOString(),
      },
    } as Job<unknown>);
    expect(runAgent).not.toHaveBeenCalled();

    const event = {
      businessId: optedIn.businessId,
      orderId: optedIn.id,
      occurredAt: optedIn.createdAt.toISOString(),
    };
    await processor.process({
      name: CUSTOMER_ORDER_COMPLETED_EVENT_JOB,
      data: event,
    } as Job<unknown>);
    await processor.process({
      name: CUSTOMER_ORDER_COMPLETED_EVENT_JOB,
      data: event,
    } as Job<unknown>);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const call = runAgent.mock.calls[0];
    if (!call) throw new Error('Expected one Customer review after the sale');
    const [calledBusinessId, actorUserId, , idempotencyKey, , options] = call;
    expect(calledBusinessId).toBe(optedIn.businessId);
    expect(actorUserId).toBeNull();
    expect(idempotencyKey).toBe(
      `customer-sale-daily:${optedIn.businessId}:${optedIn.createdAt.toISOString().slice(0, 10)}`,
    );
    expect(options).toMatchObject({
      triggerType: 'event',
      includeAiSummary: false,
      triggerRef: {
        eventId: idempotencyKey,
        sourceModule: 'customers',
        entityType: 'Business',
        entityId: optedIn.businessId,
        entityVersion: optedIn.createdAt.toISOString().slice(0, 10),
      },
    });
    expect(JSON.stringify(options?.triggerRef)).not.toContain(optedIn.id);
    const saved = await prisma.specialistAgentRun.findFirstOrThrow({
      where: {
        businessId: optedIn.businessId,
        agentKey: 'customer_intelligence',
        triggerType: 'event',
        idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey!),
      },
    });
    expect(saved.inputRefs).toEqual([options.triggerRef]);
    expect(JSON.stringify(saved.inputRefs)).not.toContain(optedIn.id);
  });
});
