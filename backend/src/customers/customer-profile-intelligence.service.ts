import { HttpStatus, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  PoliciesService,
  resolvePolicies,
} from '../common/policies/policies.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { AppException } from '../common/filters/app.exception';
import { parseDisabled } from '../business-modules/business-modules.service';
import { CustomerPrivacySettingsService } from './customer-privacy-settings.service';
import { LAPSED_DAYS } from './jobs/crm-jobs.constants';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const MIN_BASELINE_ORDERS = 3;

/** Live canonical CRM projection: no copied customer master, AI prompt or retained summary. */
@Injectable()
export class CustomerProfileIntelligenceService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly policies: PoliciesService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    private readonly privacy: CustomerPrivacySettingsService,
  ) {}

  async review(customerId: string) {
    const role = this.policies.actorRole();
    if (
      !role ||
      !(await this.policies.actorCan(CAPABILITIES.CUSTOMER_AGENT_RUN))
    ) {
      throw new AppException(
        'CUSTOMER_AGENT_FORBIDDEN',
        'Customer Intelligence permission is required.',
        HttpStatus.FORBIDDEN,
      );
    }
    const client = this.tenant.client;
    const customer = await client.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        businessId: true,
        phone: true,
        email: true,
        status: true,
        visitCount: true,
        lastVisitAt: true,
        createdAt: true,
        updatedAt: true,
        consentMarketing: true,
        optedOut: true,
      },
    });
    if (!customer)
      throw new AppException(
        'CUSTOMER_NOT_FOUND',
        'Customer not found.',
        HttpStatus.NOT_FOUND,
      );
    if (customer.phone === `erased-${customer.id}`) {
      throw new AppException(
        'CUSTOMER_AGENT_ERASED',
        'Intelligence is unavailable for an erased customer.',
        HttpStatus.GONE,
      );
    }
    await this.agentPolicy.assertEnabled(customer.businessId, 'customer');
    const business = await client.business.findUniqueOrThrow({
      where: { id: customer.businessId },
      select: {
        currency: true,
        policies: true,
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = parseDisabled(
      business.parentId
        ? business.parent?.disabledModules
        : business.disabledModules,
    );
    if (disabled.includes('customers'))
      throw new AppException(
        'BUSINESS_MODULE_DISABLED',
        'Customers is disabled for this business.',
        HttpStatus.FORBIDDEN,
      );
    const minimumOrderDecline =
      resolvePolicies({ policies: business.policies }).num(
        'agents.customerRetentionMinimumOrderDecline',
      ) ?? 1;
    const canSeeSpend =
      !disabled.includes('profit') &&
      role !== Role.staff &&
      (await this.policies.actorCan(CAPABILITIES.PROFIT_VIEW));
    const canSeeNotes =
      role !== Role.staff ||
      (await this.privacy.get(customer.businessId)).notesVisibleToStaff;
    const canSeeSupport =
      !disabled.includes('receptionist') &&
      (await this.policies.actorCan(CAPABILITIES.VOICE_MANAGE));
    const canSeeCredit =
      !disabled.includes('credit') &&
      (await this.policies.actorCan(CAPABILITIES.CREDIT_MANAGE));
    const now = new Date();
    const currentFrom = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const previousFrom = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY_MS);
    const historyFrom = new Date(now.getTime() - 90 * DAY_MS);
    const where = { businessId: customer.businessId, customerId };
    const [
      orders,
      appointments,
      messages,
      support,
      loyalty,
      memberships,
      notes,
      feedback,
      money,
      creditEntries,
    ] = await Promise.all([
      disabled.includes('orders')
        ? null
        : Promise.all([
            client.order.count({
              where: {
                ...where,
                status: 'completed',
                isQuotation: false,
                createdAt: { gte: currentFrom, lte: now },
              },
            }),
            client.order.count({
              where: {
                ...where,
                status: 'completed',
                isQuotation: false,
                createdAt: { gte: previousFrom, lt: currentFrom },
              },
            }),
            client.order.aggregate({
              where: {
                ...where,
                status: 'completed',
                isQuotation: false,
                createdAt: { lte: now },
              },
              _max: { createdAt: true },
            }),
            client.order.count({
              where: {
                ...where,
                status: 'completed',
                isQuotation: false,
                createdAt: { lte: now },
              },
            }),
          ]),
      disabled.includes('bookings')
        ? null
        : Promise.all([
            client.appointment.groupBy({
              by: ['status'],
              where: { ...where, startsAt: { gte: historyFrom, lte: now } },
              _count: { _all: true },
            }),
            client.appointment.findFirst({
              where: {
                ...where,
                status: { in: ['booked', 'confirmed'] },
                startsAt: { gt: now },
              },
              orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
              select: { id: true, startsAt: true, status: true },
            }),
          ]),
      disabled.includes('unified-inbox')
        ? null
        : client.message.groupBy({
            by: ['status'],
            where: { ...where, createdAt: { gte: historyFrom, lte: now } },
            _count: { _all: true },
          }),
      canSeeSupport
        ? client.customerSupportTicket.aggregate({
            where: { ...where, status: { notIn: ['resolved', 'closed'] } },
            _count: { _all: true },
            _max: { updatedAt: true },
          })
        : null,
      client.loyaltyMember.aggregate({
        where,
        _count: { _all: true },
        _sum: { stampCount: true },
        _max: { updatedAt: true },
      }),
      client.membership.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      canSeeNotes
        ? client.memoryNote.aggregate({
            where: {
              businessId: customer.businessId,
              subjectType: 'customer',
              subjectId: customerId,
            },
            _count: { _all: true },
            _max: { updatedAt: true },
          })
        : null,
      !disabled.includes('reviews') && role !== Role.staff
        ? Promise.all([
            client.privateFeedback.aggregate({
              where: {
                businessId: customer.businessId,
                customerId,
                createdAt: { gte: historyFrom, lte: now },
              },
              _count: { _all: true },
              _avg: { stars: true },
              _max: { createdAt: true },
            }),
            client.privateFeedback.groupBy({
              by: ['status'],
              where: {
                businessId: customer.businessId,
                customerId,
                createdAt: { gte: historyFrom, lte: now },
              },
              _count: { _all: true },
            }),
          ])
        : null,
      canSeeSpend
        ? client.customer.findUnique({
            where: { id: customerId },
            select: { lifetimeSpend: true },
          })
        : null,
      canSeeCredit
        ? client.creditEntry.groupBy({
            by: ['kind'],
            where: { businessId: customer.businessId, customerId },
            _count: { _all: true },
            _sum: { amount: true },
            _max: { createdAt: true },
          })
        : null,
    ]);
    const exclusions = [
      ...(customer.status !== 'active' ? ['Customer is not active.'] : []),
      ...(customer.optedOut ? ['Customer has opted out.'] : []),
      ...(!customer.consentMarketing
        ? ['Marketing consent is not recorded.']
        : []),
      ...(!customer.email && !customer.phone
        ? ['No contact destination is recorded.']
        : []),
    ];
    const orderActivity = orders
      ? {
          state: 'available',
          currentCount: orders[0],
          previousCount: orders[1],
          latestCreatedAt: orders[2]._max.createdAt?.toISOString() ?? null,
          allTimeCompletedCount: orders[3],
        }
      : {
          state: 'module_disabled',
          currentCount: null,
          previousCount: null,
          latestCreatedAt: null,
          allTimeCompletedCount: null,
        };
    const latestCompletedOrderAt = orderActivity.latestCreatedAt
      ? new Date(orderActivity.latestCreatedAt)
      : null;
    const rfm = {
      state: orders
        ? canSeeSpend
          ? 'available'
          : 'partial'
        : 'module_disabled',
      observedAt: now.toISOString(),
      recency: {
        state: orders ? 'available' : 'module_disabled',
        latestCompletedOrderAt: latestCompletedOrderAt?.toISOString() ?? null,
        daysSinceLatestCompletedOrder: latestCompletedOrderAt
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - latestCompletedOrderAt.getTime()) / DAY_MS,
              ),
            )
          : null,
      },
      frequency: {
        state: orders ? 'available' : 'module_disabled',
        completedNonQuotationOrderCount: orderActivity.allTimeCompletedCount,
      },
      monetary: canSeeSpend
        ? {
            state: 'available',
            recordedLifetimeSpend: money ? Number(money.lifetimeSpend) : null,
            currency: business.currency,
          }
        : {
            state: disabled.includes('profit') ? 'module_disabled' : 'restricted',
            recordedLifetimeSpend: null,
            currency: null,
          },
      score: {
        state: 'not_configured',
        value: null,
        message:
          'No RFM score or customer-specific scoring bands are configured; source values are shown without an invented score.',
      },
      definitions: {
        recency:
          'Calendar days since the latest completed, non-quotation order, measured at observedAt; no recorded order stays unavailable.',
        frequency:
          'All-time count of completed, non-quotation orders recorded for this CRM profile.',
        monetary:
          'Customer.lifetimeSpend as stored by CRM, with the business currency; it is not recomputed from orders or netted for refunds here.',
      },
    };
    const creditBalance =
      creditEntries?.reduce(
        (balance, group) =>
          balance +
          (group.kind === 'credit' ? 1 : -1) *
            Number(group._sum.amount ?? 0),
        0,
      ) ?? null;
    const creditEntryCount = creditEntries
      ? creditEntries.reduce((count, group) => count + group._count._all, 0)
      : null;
    const creditLastEntryAt =
      creditEntries?.reduce<Date | null>((latest, group) => {
        const timestamp = group._max.createdAt;
        return timestamp && (!latest || timestamp > latest) ? timestamp : latest;
      }, null) ?? null;
    const credit = {
      state: disabled.includes('credit')
        ? 'module_disabled'
        : creditBalance !== null
          ? 'available'
          : 'restricted',
      balance: creditBalance,
      currency: creditBalance === null ? null : business.currency,
      entryCount: creditEntryCount,
      lastEntryAt: creditLastEntryAt?.toISOString() ?? null,
      definition:
        'Recorded CreditEntry credit totals minus payment and write-off totals, grouped by canonical entry kind. The final balance is equivalent to the canonical ledger balance; order-level allocations are not implied. This is not an invoice balance or payment-provider settlement.',
    };
    const followUp =
      customer.status !== 'active'
        ? {
            state: 'inactive_customer',
            reason:
              'Review the canonical customer status before taking any follow-up action.',
            href: `/customers/${customerId}`,
          }
        : support && support._count._all > 0
          ? {
              state: 'support_review',
              reason: `${support._count._all} unresolved support ticket(s) need human review. This is not a claim that the customer has been contacted.`,
              href: '/receptionist/history',
            }
          : !orders
            ? {
                state: 'not_available',
                reason:
                  'Order activity comparison is unavailable while Orders is disabled.',
                href: `/customers/${customerId}`,
              }
            : orders[1] < MIN_BASELINE_ORDERS
              ? {
                  state: 'insufficient_history',
                  reason: `The previous ${WINDOW_DAYS}-day window has fewer than ${MIN_BASELINE_ORDERS} completed orders. There is insufficient baseline history for this rule.`,
                  href: `/customers/${customerId}`,
                }
              : orders[1] - orders[0] >= minimumOrderDecline
                ? {
                    state: 'activity_decline',
                    reason: `Recorded completed orders fell from ${orders[1]} to ${orders[0]} across two ${WINDOW_DAYS}-day windows, meeting the configured minimum decline of ${minimumOrderDecline}. This is a rule-based review cue, not a churn prediction or a cause.`,
                    href: `/customers/${customerId}`,
                  }
                : orders[0] < orders[1]
                  ? {
                      state: 'below_decline_threshold',
                      reason: `Recorded completed orders fell from ${orders[1]} to ${orders[0]} across two ${WINDOW_DAYS}-day windows, a decrease below the configured minimum of ${minimumOrderDecline}. No retention cue is raised by this rule.`,
                      href: `/customers/${customerId}`,
                    }
                  : {
                      state: 'no_decline',
                      reason:
                        'This completed-order count rule detected no decrease. It does not prove satisfaction or future retention.',
                      href: `/customers/${customerId}`,
                    };
    const bookingSummary = appointments
      ? [...appointments[0]]
          .sort((a, b) => a.status.localeCompare(b.status))
          .map((row) => `${row.status} ${row._count._all}`)
          .join(', ') || 'none recorded'
      : null;
    const messageSummary = messages
      ? [...messages]
          .sort((a, b) => a.status.localeCompare(b.status))
          .map((row) => `${row.status} ${row._count._all}`)
          .join(', ') || 'none recorded'
      : null;
    const narrative = [
      `The CRM profile is ${customer.status} and was created ${customer.createdAt.toISOString().slice(0, 10)}. It records ${customer.visitCount} visit(s); the latest recorded visit is ${customer.lastVisitAt?.toISOString().slice(0, 10) ?? 'not recorded'}.`,
      orders
        ? `Completed non-quotation orders were ${orders[0]} in the current ${WINDOW_DAYS}-day creation window and ${orders[1]} in the previous window. The latest completed order was ${orders[2]._max.createdAt?.toISOString().slice(0, 10) ?? 'not recorded'}. Returns and refunds are not netted, and this comparison does not establish a cause or future behavior.`
        : 'Order history is not available because the Orders module is disabled.',
      appointments
        ? `Booking records in the previous 90 days: ${bookingSummary}. ${appointments[1] ? `Next booked or confirmed appointment: ${appointments[1].startsAt.toISOString().slice(0, 16)} UTC (${appointments[1].status}).` : 'No future booked or confirmed appointment is recorded.'}`
        : 'Booking history is not available because the Bookings module is disabled.',
      messages
        ? `Unified Inbox records in the previous 90 days: ${messageSummary}. Queued or sent records do not establish delivery.`
        : 'Unified Inbox activity is not available because that module is disabled.',
      support
        ? `${support._count._all} unresolved support ticket(s) are recorded as of ${support._max.updatedAt?.toISOString().slice(0, 10) ?? 'no update date recorded'}. Ticket content is excluded.`
        : 'Support-ticket context is restricted or unavailable for this role.',
      feedback
        ? `Customer-linked private feedback in the previous 90 days: ${feedback[0]._count._all} record(s)${feedback[0]._avg.stars === null ? '' : `, average ${Number(feedback[0]._avg.stars).toFixed(1)} of 5 stars`}. Feedback text is excluded. Public reviews are not attributed to this customer because they have no customer relation.`
        : 'Customer-linked feedback is restricted or Reviews is disabled. Public reviews are not attributed to this customer because they have no customer relation.',
      `Loyalty records show ${loyalty._count._all} enrollment(s), ${loyalty._sum.stampCount ?? 0} stamp(s), and ${memberships.filter((row) => row.status === 'active').reduce((sum, row) => sum + row._count._all, 0)} active membership(s). These are recorded states, not a new reward or entitlement decision.`,
      `Human follow-up cue: ${followUp.reason}`,
      'This is a deterministic summary of the authorized source records listed below, not an AI-generated conclusion. No message is sent; channel consent and suppression must be checked again by the canonical sending service.',
    ];
    return {
      customerId,
      observedAt: now.toISOString(),
      calculationVersion: 'customer-profile-review-v2',
      coverage: 'partial',
      retainsCustomerSummary: false,
      usesAiProvider: false,
      narrative: {
        state: 'available' as const,
        method: 'deterministic' as const,
        text: narrative.join('\n\n'),
      },
      profile: {
        customerSince: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
        status: customer.status,
        recordedVisits: customer.visitCount,
        lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
      },
      windows: {
        days: WINDOW_DAYS,
        currentFrom: currentFrom.toISOString(),
        previousFrom: previousFrom.toISOString(),
        to: now.toISOString(),
        contextFrom: historyFrom.toISOString(),
        minimumPreviousOrders: MIN_BASELINE_ORDERS,
        minimumOrderDecline,
        lapsedDays: LAPSED_DAYS,
      },
      orders: orderActivity,
      rfm,
      bookings: appointments
        ? {
            state: 'available',
            statuses: Object.fromEntries(
              appointments[0].map((row) => [row.status, row._count._all]),
            ),
            next: appointments[1]
              ? {
                  ...appointments[1],
                  startsAt: appointments[1].startsAt.toISOString(),
                }
              : null,
          }
        : { state: 'module_disabled', statuses: null, next: null },
      messages: messages
        ? {
            state: 'available',
            statuses: Object.fromEntries(
              messages.map((row) => [row.status, row._count._all]),
            ),
          }
        : { state: 'module_disabled', statuses: null },
      support: support
        ? {
            state: 'available',
            unresolvedCount: support._count._all,
            latestUpdatedAt: support._max.updatedAt?.toISOString() ?? null,
          }
        : { state: 'restricted', unresolvedCount: null, latestUpdatedAt: null },
      loyalty: {
        recordedEnrollments: loyalty._count._all,
        recordedStamps: loyalty._sum.stampCount ?? 0,
        latestUpdatedAt: loyalty._max.updatedAt?.toISOString() ?? null,
        membershipStatuses: Object.fromEntries(
          memberships.map((row) => [row.status, row._count._all]),
        ),
      },
      notes: notes
        ? {
            state: 'metadata_only',
            count: notes._count._all,
            latestUpdatedAt: notes._max.updatedAt?.toISOString() ?? null,
          }
        : { state: 'restricted', count: null, latestUpdatedAt: null },
      feedback: feedback
        ? {
            state: 'available',
            count: feedback[0]._count._all,
            averageStars:
              feedback[0]._avg.stars === null
                ? null
                : Number(feedback[0]._avg.stars),
            statuses: Object.fromEntries(
              feedback[1].map((row) => [row.status, row._count._all]),
            ),
            latestCreatedAt: feedback[0]._max.createdAt?.toISOString() ?? null,
          }
        : {
            state: disabled.includes('reviews')
              ? 'module_disabled'
              : 'restricted',
            count: null,
            averageStars: null,
            statuses: null,
            latestCreatedAt: null,
          },
      financial: money
        ? {
            state: 'available',
            recordedLifetimeSpend: Number(money.lifetimeSpend),
            currency: business.currency,
          }
        : {
            state: disabled.includes('profit') ? 'module_disabled' : 'restricted',
            recordedLifetimeSpend: null,
            currency: null,
          },
      credit,
      marketing: {
        state: exclusions.length ? 'excluded' : 'requires_channel_check',
        exclusions,
        sendsMessages: false,
        message:
          'Consent flags are not send authorization. The canonical sender must recheck channel consent, suppression, quiet hours, frequency and provider configuration before any delivery.',
      },
      followUp: {
        ...followUp,
        confidence: 'not_calibrated',
        automatedAction: false,
      },
      sources: [
        {
          source: 'Customer',
          fields: [
            'visitCount',
            'lastVisitAt',
            'status',
            'consentMarketing',
            'optedOut',
          ],
          window:
            'Current canonical profile; visits are stored CRM counters, not reconstructed from orders.',
        },
        {
          source: 'Order',
          fields: ['status', 'isQuotation', 'createdAt'],
          window:
            'Two adjacent 30-day windows plus all-time RFM frequency/recency, completed non-quotation orders only. Uses creation time, not payment/fulfillment time. Returns/refunds are not netted.',
        },
        {
          source: 'Customer.lifetimeSpend',
          fields: ['lifetimeSpend'],
          window:
            'Permission-checked recorded CRM value and business currency; not recomputed from orders or netted for refunds in this review.',
        },
        {
          source: 'CreditEntry',
          fields: ['kind', 'amount', 'createdAt'],
          window:
            credit.state === 'available'
              ? 'All recorded customer credit, payment and write-off entries grouped into totals and latest-entry timestamp; only visible to users with Credit manage permission. Entry notes, payment methods and identifiers are excluded.'
              : 'Restricted by Credit manage permission or unavailable because the Credit module is disabled.',
        },
        {
          source: 'Appointment',
          fields: ['status', 'startsAt'],
          window:
            'Previous 90 days by scheduled start, plus next booked/confirmed appointment.',
        },
        {
          source: 'Message',
          fields: ['status', 'createdAt'],
          window:
            'Previous 90 days by message creation time. Queued and sent are not counted as delivered/read.',
        },
        {
          source:
            'CustomerSupportTicket / LoyaltyMember / Membership / MemoryNote',
          fields: ['status', 'updatedAt', 'stampCount'],
          window:
            'Current stored state; note content, message content, plan prices and customer contact details are not included.',
        },
        {
          source: 'PrivateFeedback',
          fields: ['stars', 'status', 'createdAt'],
          window: feedback
            ? 'Customer-linked private feedback over the previous 90 days; aggregate metadata only, no feedback text.'
            : 'Restricted to owner/manager or Reviews module disabled. Public ExternalReview rows do not identify a customer.',
        },
      ],
      limits: [
        'Partial deterministic Customer 360 summary. No customer-level data is sent to an AI model.',
        'Credit balances are included only for users with Credit manage permission. Payment-method details, private note text, review text, full inbox conversations or inferred customer traits are not included. Public ExternalReview records are not linked to individual customers and are not attributed.',
        'Historical imports, missing order history, seasonality and external purchases can affect the comparison. No calibrated churn probability or causal attribution is available.',
        'Loyalty counters and membership status are recorded state, not a new reward or entitlement decision.',
        'RFM source values are displayed without a combined score; scoring bands are not configured. Recency and frequency require the Orders module, and monetary value requires Profit view permission.',
      ],
    };
  }
}
