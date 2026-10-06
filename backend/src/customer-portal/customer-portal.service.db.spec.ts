jest.mock('../orders/invoice.service', () => ({
  InvoiceService: class InvoiceService {},
}));

import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { ClsService } from 'nestjs-cls';
import {
  DeliveryStatus,
  PaymentMethod,
  Prisma,
  ProductKind,
  QuotationStatus,
  CommerceSubscriptionInterval,
  CommerceSubscriptionStatus,
  LoyaltyProgramType,
  MembershipStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { BillingService } from '../billing/billing.service';
import { PublicBookingService } from '../bookings/public-booking.service';
import { WaitlistService } from '../bookings/waitlist.service';
import { QueueService } from '../bookings/queue.service';
import { SendGateService } from '../messaging/send-gate.service';
import { EmailService } from '../messaging/channels/email.service';
import { ReturnsService } from '../orders/returns.service';
import { OrdersService } from '../orders/orders.service';
import { InvoiceService } from '../orders/invoice.service';
import { AuditService } from '../common/audit/audit.service';
import { CommerceSubscriptionsService } from '../commerce/commerce-subscriptions.service';
import { LoyaltyService } from '../customers/loyalty.service';
import { MembershipsService } from '../customers/memberships.service';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CUSTOMER_PORTAL_FEATURES } from './customer-portal.constants';
import { CustomerPortalService } from './customer-portal.service';

class FakeClsService {
  private values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('CustomerPortalService (real MySQL)', () => {
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let cls: FakeClsService;
  let service: CustomerPortalService;
  let invoiceGenerate: jest.Mock;
  let businessId: string;
  let businessSlug: string;
  let customerId: string;
  let customerEmail: string;
  let otherCustomerId: string;
  let userId: string;
  let productId: string;
  let bookingServiceId: string;
  let customerOrderId: string;
  let otherOrderId: string;
  let ownerQuoteId: string;
  let ownerDeclineQuoteId: string;
  let otherQuoteId: string;
  let portalAuthorization: string;
  let billingCancelSubscription: jest.Mock;
  let emailSend: jest.MockedFunction<EmailService['send']>;
  let resetCustomerId: string | undefined;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    const sendGate = {
      send: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as SendGateService;
    emailSend = jest
      .fn<ReturnType<EmailService['send']>, Parameters<EmailService['send']>>()
      .mockResolvedValue({ providerRef: 'portal-reset-test' });
    const waitlistService = new WaitlistService(tenant, sendGate);
    const returns = new ReturnsService(
      tenant,
      cls as unknown as ClsService,
      {} as CashRegisterService,
      {} as BillingService,
    );
    const orders = new OrdersService(
      tenant,
      cls as unknown as ClsService,
      sendGate,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new PoliciesService(
        prisma,
        cls as unknown as ClsService,
        {} as CapabilitiesService,
      ),
    );
    billingCancelSubscription = jest.fn().mockResolvedValue(undefined);
    service = new CustomerPortalService(
      prisma,
      tenant,
      cls as unknown as ClsService,
      new PublicBookingService(prisma, sendGate, waitlistService),
      waitlistService,
      new QueueService(tenant, sendGate),
      orders,
      returns,
      {
        generate: (invoiceGenerate = jest.fn().mockResolvedValue({
          url: 'https://signed.example/customer-order.pdf',
        })),
      } as unknown as InvoiceService,
      new AuditService(tenant, cls as unknown as ClsService),
      new CommerceSubscriptionsService(tenant, orders),
      new LoyaltyService(tenant),
      new MembershipsService(tenant, {
        cancelSubscription: billingCancelSubscription,
      } as unknown as BillingService),
      { send: emailSend } as unknown as EmailService,
    );

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const business = await prisma.business.create({
      data: { name: 'Portal DB Spec', slug: `portal-db-${suffix}` },
    });
    businessId = business.id;
    businessSlug = business.slug;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const user = await prisma.user.create({
      data: {
        name: 'Portal Spec Owner',
        email: `portal-owner-${suffix}@example.test`,
        passwordHash: 'not-used-by-this-spec',
      },
    });
    userId = user.id;
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Portal Customer One',
        phone: `+1555${suffix.replace(/\D/g, '').slice(-7)}`,
        email: `portal-one-${suffix}@example.test`,
      },
    });
    customerId = customer.id;
    customerEmail = customer.email!;
    const otherCustomer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Portal Customer Two',
        phone: `+1666${suffix.replace(/\D/g, '').slice(-7)}`,
        email: `portal-two-${suffix}@example.test`,
      },
    });
    otherCustomerId = otherCustomer.id;
    await prisma.customerPortalSettings.create({
      data: {
        businessId,
        enabled: true,
        enabledFeatures: [...CUSTOMER_PORTAL_FEATURES] as Prisma.InputJsonValue,
      },
    });
    await prisma.bookingLinkSettings.create({
      data: { businessId, brandColor: '#2367A8' },
    });
    await prisma.masterListing.create({
      data: {
        businessId,
        name: 'Portal Spec Business',
        logoUrl: 'https://assets.example.test/portal-logo.svg',
      },
    });
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Portal Spec Item',
        costPrice: 7,
        sellingPrice: 25,
      },
    });
    productId = product.id;
    const bookingService = await prisma.product.create({
      data: {
        businessId,
        name: 'Portal Spec Consultation',
        kind: ProductKind.service,
        durationMin: 30,
        costPrice: 0,
        sellingPrice: 40,
      },
    });
    bookingServiceId = bookingService.id;
    const order = await prisma.order.create({
      data: {
        businessId,
        customerId,
        orderNo: 700001,
        items: {
          create: [
            { productId, name: product.name, price: 25, cost: 7, qty: 2 },
          ],
        },
        payments: {
          create: [
            {
              method: PaymentMethod.online,
              amount: 50,
              providerRef: 'private-provider-reference',
            },
          ],
        },
      },
    });
    customerOrderId = order.id;
    await prisma.delivery.create({
      data: {
        businessId,
        orderId: customerOrderId,
        addressLine: 'Customer delivery address',
        trackingToken: `portal-track-${suffix}`,
        status: DeliveryStatus.en_route,
        promisedAt: new Date('2026-10-05T12:00:00.000Z'),
      },
    });
    const otherOrder = await prisma.order.create({
      data: {
        businessId,
        customerId: otherCustomerId,
        orderNo: 700002,
        total: 999,
      },
    });
    otherOrderId = otherOrder.id;
    const ownerQuote = await prisma.order.create({
      data: {
        businessId,
        customerId,
        orderNo: 700003,
        orderType: 'quotation',
        isQuotation: true,
        quotationStatus: QuotationStatus.sent,
        quotationValidUntil: new Date(Date.now() + 86_400_000),
        total: 75,
      },
    });
    ownerQuoteId = ownerQuote.id;
    const ownerDeclineQuote = await prisma.order.create({
      data: {
        businessId,
        customerId,
        orderNo: 700004,
        orderType: 'quotation',
        isQuotation: true,
        quotationStatus: QuotationStatus.sent,
        total: 25,
      },
    });
    ownerDeclineQuoteId = ownerDeclineQuote.id;
    const otherQuote = await prisma.order.create({
      data: {
        businessId,
        customerId: otherCustomerId,
        orderNo: 700005,
        orderType: 'quotation',
        isQuotation: true,
        quotationStatus: QuotationStatus.sent,
        total: 90,
      },
    });
    otherQuoteId = otherQuote.id;
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.customerPortalPasswordReset.deleteMany({
        where: { businessId },
      });
      await prisma.customerPortalActivity.deleteMany({ where: { businessId } });
      await prisma.customerPortalIdempotency.deleteMany({
        where: { businessId },
      });
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.appointment.deleteMany({ where: { businessId } });
      await prisma.waitlistEntry.deleteMany({ where: { businessId } });
      await prisma.queueToken.deleteMany({ where: { businessId } });
      await prisma.dataSubjectRequest.deleteMany({ where: { businessId } });
      await prisma.customerPortalSession.deleteMany({ where: { businessId } });
      await prisma.customerPortalInvite.deleteMany({ where: { businessId } });
      await prisma.customerPortalLayoutVersion.deleteMany({
        where: { businessId },
      });
      await prisma.customerPortalAccount.deleteMany({ where: { businessId } });
      await prisma.customerPortalSettings.deleteMany({ where: { businessId } });
      await prisma.commerceSubscriptionAudit.deleteMany({
        where: { businessId },
      });
      await prisma.commerceSubscriptionCycle.deleteMany({
        where: { businessId },
      });
      await prisma.commerceSubscription.deleteMany({ where: { businessId } });
      await prisma.commerceSubscriptionPlan.deleteMany({
        where: { businessId },
      });
      await prisma.membership.deleteMany({ where: { businessId } });
      await prisma.membershipPlan.deleteMany({ where: { businessId } });
      await prisma.stamp.deleteMany({ where: { member: { businessId } } });
      await prisma.loyaltyMember.deleteMany({ where: { businessId } });
      await prisma.loyaltyProgram.deleteMany({ where: { businessId } });
      await prisma.bookingLinkSettings.deleteMany({ where: { businessId } });
      await prisma.masterListing.deleteMany({ where: { businessId } });
      await prisma.returnItem.deleteMany({ where: { return: { businessId } } });
      await prisma.return.deleteMany({ where: { businessId } });
      await prisma.delivery.deleteMany({ where: { businessId } });
      await prisma.payment.deleteMany({ where: { order: { businessId } } });
      await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
      await prisma.order.deleteMany({ where: { businessId } });
      await prisma.product.deleteMany({
        where: { id: { in: [productId, bookingServiceId].filter(Boolean) } },
      });
      if (customerId || otherCustomerId) {
        await prisma.customer.deleteMany({
          where: {
            id: {
              in: [customerId, otherCustomerId, resetCustomerId].filter(
                (id): id is string => Boolean(id),
              ),
            },
          },
        });
      }
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.business.deleteMany({ where: { id: businessId } });
    }
    await prisma.$disconnect();
  });

  it('uses a one-use invite to establish a customer-only session and never crosses customer records', async () => {
    const invite = await service.createInvite(businessId, userId, customerId);
    expect(invite.delivery).toContain('did not send');
    expect(invite.invitePath).toContain(
      `/portal/${businessSlug}/accept?token=`,
    );
    const token = new URL(
      invite.invitePath,
      'https://portal.example',
    ).searchParams.get('token');
    expect(token).toBeTruthy();

    await expect(
      service.acceptInvite('someone-elses-business', {
        token: token!,
        password: 'safe-portal-password-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'PORTAL_INVITE_INVALID' } });

    const session = await service.acceptInvite(businessSlug, {
      token: token!,
      password: 'safe-portal-password-1',
    });
    const authorization = `Bearer ${session.accessToken}`;
    portalAuthorization = authorization;
    const me = await service.getMe(authorization);
    expect(me.identity.customerId).toBe(customerId);
    expect(me.identity.businessId).toBe(businessId);
    expect(me.customer?.consentMarketing).toBe(true);

    const orders = await service.getOrders(authorization);
    const customerSales = orders.items.filter((order) => !order.isQuotation);
    expect(customerSales.map((order) => order.id)).toEqual([customerOrderId]);
    expect(orders.items.map((order) => order.orderNo)).not.toContain(700002);
    expect(customerSales[0]?.paymentStatus).toBe('paid');
    expect(customerSales[0]?.delivery).toMatchObject({
      status: DeliveryStatus.en_route,
      promisedAt: new Date('2026-10-05T12:00:00.000Z'),
    });
    expect(customerSales[0]?.delivery?.trackingToken).toContain(
      'portal-track-',
    );
    const firstOrderPage = await service.getOrders(authorization, { limit: 1 });
    expect(firstOrderPage.items).toHaveLength(1);
    expect(firstOrderPage.hasMore).toBe(true);
    expect(firstOrderPage.nextCursor).toBe(firstOrderPage.items[0]?.id);
    const secondOrderPage = await service.getOrders(authorization, {
      limit: 1,
      cursor: firstOrderPage.nextCursor ?? undefined,
    });
    expect(secondOrderPage.items).toHaveLength(1);
    expect(secondOrderPage.items[0]?.id).not.toBe(firstOrderPage.items[0]?.id);
    expect(secondOrderPage.items[0]?.orderNo).not.toBe(700002);
    const bookableServices = await service.listBookableServices(authorization);
    expect(bookableServices).toEqual([
      expect.objectContaining({
        id: bookingServiceId,
        name: 'Portal Spec Consultation',
      }),
    ]);
    const requestedStart = new Date(Date.now() + 14 * 86_400_000);
    requestedStart.setUTCHours(12, 0, 0, 0);
    const createdBooking = await service.createPortalBooking(authorization, {
      serviceId: bookingServiceId,
      startsAt: requestedStart.toISOString(),
    });
    expect(
      await prisma.appointment.findFirst({
        where: { id: createdBooking.id, customerId, businessId },
      }),
    ).not.toBeNull();
    const waitlistEntry = await service.joinPortalWaitlist(authorization, {
      serviceId: bookingServiceId,
    });
    expect(
      await prisma.waitlistEntry.findFirst({
        where: { id: waitlistEntry.id, customerId, businessId },
      }),
    ).not.toBeNull();
    const queueEntry = await service.joinPortalQueue(
      authorization,
      bookingServiceId,
    );
    expect(
      await prisma.queueToken.findFirst({
        where: { id: queueEntry.id, customerId, businessId },
      }),
    ).not.toBeNull();
    const bookingData = await service.getBookings(authorization);
    expect(bookingData).toMatchObject({
      appointments: [expect.objectContaining({ id: createdBooking.id })],
      waitlist: [expect.objectContaining({ id: waitlistEntry.id })],
      queue: [expect.objectContaining({ id: queueEntry.id })],
    });
    expect(bookingData.pagination).toMatchObject({
      appointments: { hasMore: false, nextCursor: null },
      waitlist: { hasMore: false, nextCursor: null },
      queue: { hasMore: false, nextCursor: null },
    });
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'Appointment',
          entityId: createdBooking.id,
          action: 'customer.portal_booking_created',
        },
      }),
    ).toBe(1);
    await expect(
      service.createPortalBooking(authorization, {
        serviceId: productId,
        startsAt: requestedStart.toISOString(),
      }),
    ).rejects.toMatchObject({
      response: { code: 'BOOKING_SERVICE_NOT_FOUND' },
    });

    await expect(
      service.respondToQuote(authorization, otherQuoteId, {
        response: 'accept',
      }),
    ).rejects.toMatchObject({ response: { code: 'PORTAL_NOT_FOUND' } });
    const acceptedQuote = await service.respondToQuote(
      authorization,
      ownerQuoteId,
      { response: 'accept' },
    );
    expect(acceptedQuote.quotationStatus).toBe(QuotationStatus.accepted);
    await expect(
      service.respondToQuote(authorization, ownerDeclineQuoteId, {
        response: 'decline',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_QUOTE_REASON_REQUIRED' },
    });
    const declinedQuote = await service.respondToQuote(
      authorization,
      ownerDeclineQuoteId,
      { response: 'decline', reason: 'Please revise the delivery date.' },
    );
    expect(declinedQuote.quotationStatus).toBe(QuotationStatus.declined);
    expect(
      await prisma.order.findUniqueOrThrow({
        where: { id: ownerDeclineQuoteId },
        select: { declineReason: true },
      }),
    ).toMatchObject({ declineReason: 'Please revise the delivery date.' });
    const billing = await service.getBilling(authorization, { limit: 1 });
    expect(JSON.stringify(billing)).not.toContain('private-provider-reference');
    expect(JSON.stringify(billing)).not.toContain('"cost"');
    expect(billing.quotes).toHaveLength(1);
    expect(billing.pagination.quotes.hasMore).toBe(true);
    const nextQuotePage = await service.getBilling(authorization, {
      limit: 1,
      quotesCursor: billing.pagination.quotes.nextCursor ?? undefined,
    });
    expect(nextQuotePage.quotes).toHaveLength(1);
    expect(nextQuotePage.quotes[0]?.id).not.toBe(billing.quotes[0]?.id);

    const receipt = await service.downloadReceipt(
      authorization,
      customerOrderId,
    );
    expect(receipt.url).toBe('https://signed.example/customer-order.pdf');
    expect(invoiceGenerate).toHaveBeenCalledWith(businessId, customerOrderId);
    await expect(
      service.downloadReceipt(authorization, otherOrderId),
    ).rejects.toMatchObject({ response: { code: 'PORTAL_NOT_FOUND' } });
    expect(invoiceGenerate).toHaveBeenCalledTimes(1);

    const reordered = await service.createReorderDraft(
      authorization,
      customerOrderId,
    );
    const reorderOrder = await prisma.order.findFirstOrThrow({
      where: { id: reordered.id, businessId, customerId },
      include: { items: true, payments: true },
    });
    expect(reorderOrder.status).toBe('draft');
    expect(reorderOrder.total.toString()).toBe('50');
    expect(reorderOrder.items).toHaveLength(1);
    expect(reorderOrder.payments).toHaveLength(0);
    await expect(
      service.createReorderDraft(authorization, otherOrderId),
    ).rejects.toMatchObject({ response: { code: 'PORTAL_NOT_FOUND' } });

    const updatedProfile = await service.updateProfile(authorization, {
      consentMarketing: false,
    });
    expect(updatedProfile.consentMarketing).toBe(false);
    expect(
      (await service.getMe(authorization)).customer?.consentMarketing,
    ).toBe(false);
    const consentAudit = await prisma.auditLog.findFirst({
      where: {
        businessId,
        entity: 'Customer',
        entityId: customerId,
        action: 'customer.portal_profile_updated',
      },
    });
    expect(consentAudit?.before).toMatchObject({ consentMarketing: true });
    expect(consentAudit?.after).toMatchObject({ consentMarketing: false });

    await expect(
      service.updateProfile(authorization, {
        email: 'unverified-change@example.test',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_CONTACT_VERIFICATION_UNAVAILABLE' },
    });
    expect(
      (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } }))
        .email,
    ).toBe(customerEmail);

    const exportRequest = await service.requestDataExport(authorization);
    const retriedExportRequest = await service.requestDataExport(authorization);
    expect(exportRequest.status).toBe('pending');
    expect(retriedExportRequest.id).toBe(exportRequest.id);
    expect(retriedExportRequest.reusedOpenRequest).toBe(true);
    expect(
      await prisma.dataSubjectRequest.count({
        where: { businessId, customerId, kind: 'export', status: 'pending' },
      }),
    ).toBe(1);
    expect((await service.getMe(authorization)).dataRequests[0]?.id).toBe(
      exportRequest.id,
    );
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'DataSubjectRequest',
          entityId: exportRequest.id,
          action: 'customer.portal_data_export_requested',
        },
      }),
    ).toBe(1);

    await prisma.customer.update({
      where: { id: customerId },
      data: { tags: ['vip'] },
    });
    const personalizedLayout = await service.saveLayoutDraft(
      businessId,
      userId,
      {
        cards: ['orders', 'billing'],
        labels: [{ card: 'orders', label: 'Your purchases' }],
        announcements: [
          { title: 'Holiday hours', body: 'We close at 4 PM.', enabled: true },
        ],
        quickActions: [{ label: 'Open purchases', destination: 'orders' }],
        visibilityRules: [
          { card: 'billing', customerTags: ['vip'] },
          { card: 'orders', customerTags: ['vip'] },
        ],
      },
    );
    await service.publishLayout(businessId, personalizedLayout.version);
    const personalizedHome = await service.getHome(authorization);
    expect(personalizedHome.layout.cards).toEqual(['orders', 'billing']);
    expect(personalizedHome.layout.labels).toContainEqual({
      card: 'orders',
      label: 'Your purchases',
    });
    expect(personalizedHome.layout.announcements).toContainEqual({
      title: 'Holiday hours',
      body: 'We close at 4 PM.',
      enabled: true,
    });
    expect(personalizedHome.layout.quickActions).toContainEqual({
      label: 'Open purchases',
      destination: 'orders',
    });
    const bootstrap = await service.getPublicBootstrap(businessSlug);
    expect(bootstrap).toMatchObject({
      brandColor: '#2367A8',
      logoUrl: 'https://assets.example.test/portal-logo.svg',
    });
    expect(JSON.stringify(bootstrap)).not.toContain('customerTags');
    expect(JSON.stringify(bootstrap)).not.toContain('vip');
    expect(await service.getSettings(businessId)).toMatchObject({
      branding: {
        brandColor: '#2367A8',
        colorSource: 'Booking Link settings',
        logoUrl: 'https://assets.example.test/portal-logo.svg',
        logoSource: 'Business Listings',
      },
    });
    await prisma.customer.update({
      where: { id: customerId },
      data: { tags: ['standard'] },
    });
    const nonMatchingHome = await service.getHome(authorization);
    expect(nonMatchingHome.layout.cards).toEqual([]);
    expect(nonMatchingHome.layout.quickActions).toEqual([]);
    expect(nonMatchingHome.orders).toEqual([]);
    expect(nonMatchingHome.upcomingAppointments).toEqual([]);

    await prisma.customerPortalSettings.update({
      where: { businessId },
      data: {
        enabledFeatures: CUSTOMER_PORTAL_FEATURES.filter(
          (feature) => feature !== 'orders',
        ),
      },
    });
    const featureDisabledHome = await service.getHome(authorization);
    expect(featureDisabledHome.layout.cards).toEqual([]);
    expect(featureDisabledHome.orders).toEqual([]);
    await expect(service.getOrders(authorization)).rejects.toMatchObject({
      response: { code: 'PORTAL_FEATURE_DISABLED' },
    });

    const requested = await service.requestReturn(authorization, {
      orderId: customerOrderId,
      reason: 'Item arrived damaged',
      refundMethod: 'cash',
      items: [{ productId, qty: 1 }],
    });
    expect(requested.status).toBe('pending');
    expect(Number(requested.refundAmount)).toBe(25);
    const highestOrderNo = await prisma.order.aggregate({
      where: { businessId },
      _max: { orderNo: true },
    });
    await prisma.order.create({
      data: {
        businessId,
        customerId,
        orderNo: (highestOrderNo._max.orderNo ?? 700005) + 1,
        items: {
          create: [
            { productId, name: 'Portal Spec Item', price: 25, cost: 7, qty: 1 },
          ],
        },
      },
    });
    const returnPage = await service.getReturns(authorization, { limit: 1 });
    expect(returnPage.returns.map((item) => item.id)).toContain(requested.id);
    expect(returnPage.pagination.eligibleOrders.hasMore).toBe(true);
    const nextEligiblePage = await service.getReturns(authorization, {
      limit: 1,
      eligibleOrdersCursor:
        returnPage.pagination.eligibleOrders.nextCursor ?? undefined,
    });
    expect(nextEligiblePage.eligibleOrders).toHaveLength(1);
    expect(nextEligiblePage.eligibleOrders[0]?.id).not.toBe(
      returnPage.eligibleOrders[0]?.id,
    );
    expect(
      nextEligiblePage.eligibleOrders.map((item) => item.orderNo),
    ).not.toContain(700002);
    await expect(
      service.requestReturn(authorization, {
        orderId: otherOrderId,
        reason: 'Not my order',
        refundMethod: 'cash',
        items: [{ productId, qty: 1 }],
      }),
    ).rejects.toMatchObject({ response: { code: 'PORTAL_NOT_FOUND' } });

    await expect(
      service.acceptInvite(businessSlug, {
        token: token!,
        password: 'safe-portal-password-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'PORTAL_INVITE_INVALID' } });
  });

  it('allows only the signed-in customer to redeem loyalty and manage recurring records', async () => {
    const plan = await prisma.commerceSubscriptionPlan.create({
      data: {
        businessId,
        name: `Portal subscription ${Date.now()}`,
        productId,
        qtyPerCycle: 1,
        interval: CommerceSubscriptionInterval.month,
        allowSkip: true,
      },
    });
    const ownedSubscription = await prisma.commerceSubscription.create({
      data: {
        businessId,
        planId: plan.id,
        customerId,
        nextRenewalAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    const otherSubscription = await prisma.commerceSubscription.create({
      data: {
        businessId,
        planId: plan.id,
        customerId: otherCustomerId,
        nextRenewalAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    await expect(
      service.updateCommerceSubscription(
        portalAuthorization,
        otherSubscription.id,
        {
          action: 'pause',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'PORTAL_NOT_FOUND' } });
    const paused = await service.updateCommerceSubscription(
      portalAuthorization,
      ownedSubscription.id,
      { action: 'pause' },
    );
    expect(paused.status).toBe(CommerceSubscriptionStatus.paused);
    const resumed = await service.updateCommerceSubscription(
      portalAuthorization,
      ownedSubscription.id,
      { action: 'resume' },
    );
    expect(resumed.status).toBe(CommerceSubscriptionStatus.active);
    const skipped = await service.updateCommerceSubscription(
      portalAuthorization,
      ownedSubscription.id,
      { action: 'skip_next' },
    );
    expect(skipped.skipNextCycle).toBe(true);
    const unskipped = await service.updateCommerceSubscription(
      portalAuthorization,
      ownedSubscription.id,
      { action: 'keep_next' },
    );
    expect(unskipped.skipNextCycle).toBe(false);
    await expect(
      service.updateCommerceSubscription(
        portalAuthorization,
        ownedSubscription.id,
        {
          action: 'cancel',
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_SUBSCRIPTION_REASON_REQUIRED' },
    });
    const cancelled = await service.updateCommerceSubscription(
      portalAuthorization,
      ownedSubscription.id,
      { action: 'cancel', reason: 'No longer needed' },
    );
    expect(cancelled.status).toBe(CommerceSubscriptionStatus.cancelled);
    expect(
      await prisma.commerceSubscriptionAudit.findFirst({
        where: {
          businessId,
          entityId: ownedSubscription.id,
          action: 'subscription_cancelled',
          actorUserId: null,
        },
      }),
    ).not.toBeNull();

    const program = await prisma.loyaltyProgram.create({
      data: {
        businessId,
        name: `Portal reward ${Date.now()}`,
        type: LoyaltyProgramType.punch_card,
        stampsRequired: 2,
        active: true,
      },
    });
    const ownedMember = await prisma.loyaltyMember.create({
      data: {
        businessId,
        programId: program.id,
        customerId,
        stampCount: 2,
      },
    });
    const otherMember = await prisma.loyaltyMember.create({
      data: { businessId, programId: program.id, customerId: otherCustomerId },
    });
    await prisma.stamp.createMany({
      data: [
        { memberId: ownedMember.id },
        { memberId: ownedMember.id },
        { memberId: otherMember.id },
      ],
    });
    const loyaltyData = await service.getLoyalty(portalAuthorization, {
      limit: 1,
    });
    expect(loyaltyData.loyalty.map((item) => item.id)).toEqual([
      ownedMember.id,
    ]);
    expect(loyaltyData.subscriptions.map((item) => item.id)).toEqual([
      ownedSubscription.id,
    ]);
    expect(loyaltyData.pagination.loyalty.hasMore).toBe(false);
    await expect(
      service.redeemLoyaltyReward(portalAuthorization, otherMember.id),
    ).rejects.toMatchObject({ response: { code: 'PORTAL_NOT_FOUND' } });
    const redeemed = await service.redeemLoyaltyReward(
      portalAuthorization,
      ownedMember.id,
    );
    expect(redeemed).toMatchObject({ stampCount: 0, redeemedCount: 1 });
    expect(
      await prisma.stamp.count({
        where: { memberId: ownedMember.id, redeemed: true },
      }),
    ).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'LoyaltyMember',
          entityId: ownedMember.id,
          action: 'customer.portal_loyalty_reward_redeemed',
        },
      }),
    ).toBe(1);

    const membershipPlan = await prisma.membershipPlan.create({
      data: {
        businessId,
        name: `Portal membership ${Date.now()}`,
        price: 19.99,
        interval: 'monthly',
      },
    });
    const onlineMembership = await prisma.membership.create({
      data: {
        businessId,
        planId: membershipPlan.id,
        customerId,
        status: MembershipStatus.active,
        method: PaymentMethod.online,
        stripeSubscriptionId: `sub_portal_spec_${Date.now()}`,
      },
    });
    const otherMembership = await prisma.membership.create({
      data: {
        businessId,
        planId: membershipPlan.id,
        customerId: otherCustomerId,
        status: MembershipStatus.active,
        method: PaymentMethod.cash,
      },
    });
    await expect(
      service.cancelMembership(portalAuthorization, otherMembership.id, {
        reason: 'Customer cannot access another membership',
      }),
    ).rejects.toMatchObject({ response: { code: 'PORTAL_NOT_FOUND' } });
    const membershipResult = await service.cancelMembership(
      portalAuthorization,
      onlineMembership.id,
      { reason: 'Customer ended the membership' },
    );
    expect(membershipResult.status).toBe(MembershipStatus.cancelled);
    expect(billingCancelSubscription).toHaveBeenCalledWith(
      onlineMembership.stripeSubscriptionId,
    );
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entity: 'Membership',
          entityId: onlineMembership.id,
          action: 'customer.portal_membership_cancelled',
        },
      }),
    ).toBe(1);
  });

  it('serializes layout versions, publishes one version, and restores by creating a new draft', async () => {
    const first = await service.saveLayoutDraft(businessId, userId, {
      cards: ['orders', 'loyalty'],
    });
    const second = await service.saveLayoutDraft(businessId, userId, {
      cards: ['bookings'],
    });
    expect(second.version).toBe(first.version + 1);
    await service.publishLayout(businessId, first.version);
    await service.publishLayout(businessId, second.version);
    const published = await prisma.customerPortalLayoutVersion.findMany({
      where: { businessId, status: 'published' },
      select: { version: true },
    });
    expect(published).toEqual([{ version: second.version }]);
    const restored = await service.restoreLayout(
      businessId,
      userId,
      first.version,
    );
    expect(restored.status).toBe('draft');
    expect(restored.version).toBe(second.version + 1);
    expect(restored.layout).toMatchObject({ cards: ['orders', 'loyalty'] });
  });

  it('replays an idempotent layout create and rejects reusing its key for another request', async () => {
    const layout = { cards: ['orders'] };
    const createDraft = () =>
      service.saveLayoutDraft(businessId, userId, layout);
    const first = await service.executeAdminMutation(
      businessId,
      userId,
      'portal-layout-create-qa-001',
      'layout:save-draft',
      layout,
      createDraft,
    );
    const replay = await service.executeAdminMutation(
      businessId,
      userId,
      'portal-layout-create-qa-001',
      'layout:save-draft',
      layout,
      createDraft,
    );

    expect(replay).toEqual({
      ...first,
      createdAt: first.createdAt.toISOString(),
    });
    expect(
      await prisma.customerPortalLayoutVersion.count({
        where: { businessId, id: first.id },
      }),
    ).toBe(1);
    await expect(
      service.executeAdminMutation(
        businessId,
        userId,
        'portal-layout-create-qa-001',
        'layout:save-draft',
        { cards: ['bookings'] },
        createDraft,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_IDEMPOTENCY_KEY_REUSED' },
    });
    await expect(
      service.executeAdminMutation(
        businessId,
        userId,
        undefined,
        'layout:save-draft',
        layout,
        createDraft,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_IDEMPOTENCY_KEY_REQUIRED' },
    });
  });

  it('sends one-use hashed reset links without revealing whether a portal email exists', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const resetEmail = `portal-reset-${suffix}@example.test`;
    const resetCustomer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Portal Reset Customer',
        phone: `+1777${suffix.replace(/\D/g, '').slice(-7)}`,
        email: resetEmail,
      },
    });
    resetCustomerId = resetCustomer.id;
    const resetAccount = await prisma.customerPortalAccount.create({
      data: {
        businessId,
        customerId: resetCustomer.id,
        passwordHash: await bcrypt.hash('old-portal-password-001', 10),
      },
    });
    const emailBefore = emailSend.mock.calls.length;
    const knownResponse = await service.requestPasswordReset(businessSlug, {
      email: resetEmail,
    });
    const unknownResponse = await service.requestPasswordReset(businessSlug, {
      email: `nobody-${suffix}@example.test`,
    });
    expect(knownResponse).toEqual(unknownResponse);
    expect(emailSend).toHaveBeenCalledTimes(emailBefore + 1);

    const sent = emailSend.mock.calls[emailSend.mock.calls.length - 1][0];
    expect(sent.text).toContain('one-time link');
    const resetUrl = sent.text.match(/https?:\/\/\S+/)?.[0];
    expect(resetUrl).toBeTruthy();
    const token = new URL(resetUrl!).searchParams.get('token');
    expect(token).toBeTruthy();
    const tokenHash = createHash('sha256').update(token!).digest('hex');
    const storedReset = await prisma.customerPortalPasswordReset.findUnique({
      where: { tokenHash },
    });
    expect(storedReset).toMatchObject({
      businessId,
      accountId: resetAccount.id,
      usedAt: null,
    });
    expect(storedReset?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const updated = await service.resetPassword(businessSlug, {
      token: token!,
      password: 'new-portal-password-002',
    });
    expect(updated).toEqual({ passwordReset: true });
    await expect(
      service.resetPassword(businessSlug, {
        token: token!,
        password: 'another-portal-password-003',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_PASSWORD_RESET_INVALID' },
    });
    await expect(
      service.login({
        businessSlug,
        email: resetEmail,
        password: 'old-portal-password-001',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_INVALID_CREDENTIALS' },
    });
    await expect(
      service.login({
        businessSlug,
        email: resetEmail,
        password: 'new-portal-password-002',
      }),
    ).resolves.toMatchObject({ tokenType: 'Bearer' });

    emailSend.mockClear();
    await service.requestPasswordReset(businessSlug, { email: resetEmail });
    const expiring = emailSend.mock.calls[0][0];
    const expiringUrl = expiring.text.match(/https?:\/\/\S+/)?.[0];
    const expiringToken = new URL(expiringUrl!).searchParams.get('token')!;
    const expiringHash = createHash('sha256')
      .update(expiringToken)
      .digest('hex');
    await prisma.customerPortalPasswordReset.update({
      where: { tokenHash: expiringHash },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      service.resetPassword(businessSlug, {
        token: expiringToken,
        password: 'expired-reset-password-004',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_PASSWORD_RESET_INVALID' },
    });
  });
});
