import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  AppointmentStatus,
  CommerceSubscriptionStatus,
  CustomerStatus,
  DsrRequestKind,
  DsrRequestStatus,
  Prisma,
  QuotationStatus,
} from '@prisma/client';
import type { CustomerPortalAccount } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { PublicBookingService } from '../bookings/public-booking.service';
import { WaitlistService } from '../bookings/waitlist.service';
import { QueueService } from '../bookings/queue.service';
import { ReturnsService } from '../orders/returns.service';
import { InvoiceService } from '../orders/invoice.service';
import { OrdersService } from '../orders/orders.service';
import { derivePaymentStatus } from '../orders/orders.service';
import { CommerceSubscriptionsService } from '../commerce/commerce-subscriptions.service';
import { LoyaltyService } from '../customers/loyalty.service';
import { MembershipsService } from '../customers/memberships.service';
import { CreateReturnDto } from '../orders/dto/create-return.dto';
import {
  CUSTOMER_PORTAL_FEATURES,
  CUSTOMER_PORTAL_HOME_CARDS,
  CUSTOMER_PORTAL_LOCK_MINUTES,
  CUSTOMER_PORTAL_MAX_LOGIN_ATTEMPTS,
  CUSTOMER_PORTAL_SESSION_DAYS,
  CustomerPortalCard,
  CustomerPortalFeature,
} from './customer-portal.constants';
import {
  CustomerPortalAcceptInviteDto,
  CustomerPortalBookAppointmentDto,
  CustomerPortalCommerceSubscriptionActionDto,
  CustomerPortalLayoutDto,
  CustomerPortalLoginDto,
  CustomerPortalMembershipCancelDto,
  CustomerPortalPaginationDto,
  CustomerPortalProfileDto,
  CustomerPortalQuoteResponseDto,
  CustomerPortalSettingsDto,
  CustomerPortalWaitlistDto,
} from './customer-portal.dto';

const BCRYPT_ROUNDS = 10;
const HASHED_TOKEN_BYTES = 32;
const PORTAL_PAGE_DEFAULT_LIMIT = 20;
const PORTAL_PAGE_MAX_LIMIT = 50;

interface CustomerPortalCursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PortalIdentity {
  businessId: string;
  businessSlug: string;
  businessName: string;
  currency: string;
  locale: string;
  customerId: string;
  customerName: string;
  accountId: string;
  enabledFeatures: string[];
  customerTags: string[];
}

@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly bookings: PublicBookingService,
    private readonly waitlist: WaitlistService,
    private readonly queue: QueueService,
    private readonly orders: OrdersService,
    private readonly returns: ReturnsService,
    private readonly invoices: InvoiceService,
    private readonly audit: AuditService,
    private readonly commerceSubscriptions: CommerceSubscriptionsService,
    private readonly loyalty: LoyaltyService,
    private readonly memberships: MembershipsService,
  ) {}

  async executeCustomerMutation<T>(
    authorization: string | undefined,
    feature: CustomerPortalFeature,
    idempotencyKey: string | undefined,
    operation: string,
    request: unknown,
    action: () => Promise<T>,
    replayable = true,
  ): Promise<T> {
    const identity = await this.requireIdentity(authorization, feature);
    return this.executeIdempotent(
      identity.businessId,
      `customer:${identity.accountId}`,
      idempotencyKey,
      operation,
      request,
      action,
      replayable,
    );
  }

  async executeAdminMutation<T>(
    businessId: string,
    actorUserId: string,
    idempotencyKey: string | undefined,
    operation: string,
    request: unknown,
    action: () => Promise<T>,
    replayable = true,
  ): Promise<T> {
    return this.executeIdempotent(
      businessId,
      `user:${actorUserId}`,
      idempotencyKey,
      operation,
      request,
      action,
      replayable,
    );
  }

  private async executeIdempotent<T>(
    businessId: string,
    principalId: string,
    rawKey: string | undefined,
    operation: string,
    request: unknown,
    action: () => Promise<T>,
    replayable: boolean,
  ): Promise<T> {
    const key = rawKey?.trim();
    if (!key || key.length < 8 || key.length > 200) {
      throw new AppException(
        'PORTAL_IDEMPOTENCY_KEY_REQUIRED',
        'Send an Idempotency-Key between 8 and 200 characters for this action.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const keyHash = this.hashToken(key);
    const requestHash = this.hashToken(
      JSON.stringify({ operation, request: this.canonicalize(request) }),
    );
    let recordId: string;
    try {
      const record = await this.prisma.customerPortalIdempotency.create({
        data: { businessId, principalId, keyHash, requestHash },
      });
      recordId = record.id;
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )) {
        throw error;
      }
      const existing = await this.prisma.customerPortalIdempotency.findUnique({
        where: {
          businessId_principalId_keyHash: {
            businessId,
            principalId,
            keyHash,
          },
        },
      });
      if (!existing) throw error;
      if (existing.requestHash !== requestHash) {
        throw new AppException(
          'PORTAL_IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used for a different action. Use a new key.',
          HttpStatus.CONFLICT,
        );
      }
      if (existing.status === 'unreplayable') {
        throw new AppException(
          'PORTAL_IDEMPOTENCY_REPLAY_UNAVAILABLE',
          'This action already ran, but its one-time secret is not replayed. Check the current invite before creating another.',
          HttpStatus.CONFLICT,
        );
      }
      if (existing.status === 'completed') {
        if (existing.response === null) {
          throw new AppException(
            'PORTAL_IDEMPOTENCY_REPLAY_UNAVAILABLE',
            'This action already ran, but its one-time secret is not replayed. Check the current invite before creating another.',
            HttpStatus.CONFLICT,
          );
        }
        return existing.response as unknown as T;
      }
      throw new AppException(
        'PORTAL_IDEMPOTENCY_OUTCOME_UNKNOWN',
        existing.status === 'failed'
          ? 'The previous request did not finish cleanly. Check the affected record before retrying with a new key.'
          : 'This request is already being processed. Wait for it to finish before retrying.',
        HttpStatus.CONFLICT,
      );
    }

    try {
      const result = await action();
      const normalized = JSON.parse(
        JSON.stringify(result),
      ) as Prisma.InputJsonValue;
      await this.prisma.customerPortalIdempotency.update({
        where: { id: recordId },
        data: {
          status: replayable ? 'completed' : 'unreplayable',
          response: replayable ? normalized : Prisma.DbNull,
        },
      });
      return result;
    } catch (error) {
      await this.prisma.customerPortalIdempotency.updateMany({
        where: { id: recordId, status: 'processing' },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map((item) => this.canonicalize(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.canonicalize(item)]),
      );
    }
    return value;
  }

  async getAdminOverview(businessId: string) {
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [
      business,
      settings,
      accounts,
      pendingInvites,
      publishedLayout,
      recentActivity,
      eventsThisWeek,
      activeCustomers30Days,
      signInsThisWeek,
      failedSignInsThisWeek,
      selfServiceActionsThisWeek,
      currentlyLockedAccounts,
    ] = await Promise.all([
      this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { id: true, name: true, slug: true, branding: true },
      }),
      this.tenantPrisma.client.customerPortalSettings.findUnique({
        where: { businessId },
      }),
      this.tenantPrisma.client.customerPortalAccount.count({
        where: { businessId, active: true },
      }),
      this.tenantPrisma.client.customerPortalInvite.count({
        where: {
          businessId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      }),
      this.tenantPrisma.client.customerPortalLayoutVersion.findFirst({
        where: { businessId, status: 'published' },
        orderBy: { version: 'desc' },
        select: { version: true, publishedAt: true },
      }),
      this.tenantPrisma.client.customerPortalActivity.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          event: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      this.tenantPrisma.client.customerPortalActivity.count({
        where: { businessId, createdAt: { gte: since } },
      }),
      this.tenantPrisma.client.customerPortalAccount.count({
        where: {
          businessId,
          active: true,
          sessions: {
            some: {
              revokedAt: null,
              expiresAt: { gt: now },
              lastUsedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
            },
          },
        },
      }),
      this.tenantPrisma.client.customerPortalActivity.count({
        where: { businessId, event: 'signed_in', createdAt: { gte: since } },
      }),
      this.tenantPrisma.client.customerPortalActivity.count({
        where: {
          businessId,
          event: { in: ['login_failed', 'login_blocked'] },
          createdAt: { gte: since },
        },
      }),
      this.tenantPrisma.client.customerPortalActivity.count({
        where: {
          businessId,
          event: {
            in: [
              'profile_updated',
              'marketing_consent_updated',
              'booking_cancelled',
              'booking_rescheduled',
              'booking_created',
              'waitlist_joined',
              'queue_joined',
              'quote_accepted',
              'quote_declined',
              'reorder_draft_created',
              'return_requested',
              'data_export_requested',
            ],
          },
          createdAt: { gte: since },
        },
      }),
      this.tenantPrisma.client.customerPortalAccount.count({
        where: { businessId, active: true, lockedUntil: { gt: now } },
      }),
    ]);
    if (!business) throw this.notFound('Business not found');

    return {
      business,
      settings: this.settingsShape(settings),
      activeAccounts: accounts,
      activeCustomers30Days,
      signInsLast7Days: signInsThisWeek,
      failedSignInsLast7Days: failedSignInsThisWeek,
      selfServiceActionsLast7Days: selfServiceActionsThisWeek,
      currentlyLockedAccounts,
      pendingInvites,
      publishedLayout,
      recentActivity,
      customerPortalEventsLast7Days: eventsThisWeek,
      unsupported: {
        supportTickets:
          'Not available — no customer support ticket service exists yet.',
        onlineInvoicePayments:
          'Not configured — the billing module has no customer one-off invoice checkout flow.',
        warrantyClaims:
          'Not tracked — no warranty claim records exist in the system.',
      },
    };
  }

  async getSettings(businessId: string) {
    const [settings, business, bookingSettings, masterListing] =
      await Promise.all([
        this.tenantPrisma.client.customerPortalSettings.findUnique({
          where: { businessId },
        }),
        this.tenantPrisma.client.business.findUnique({
          where: { id: businessId },
          select: { name: true, slug: true, locale: true },
        }),
        this.tenantPrisma.client.bookingLinkSettings.findUnique({
          where: { businessId },
          select: { brandColor: true },
        }),
        this.tenantPrisma.client.masterListing.findUnique({
          where: { businessId },
          select: { logoUrl: true },
        }),
      ]);
    if (!business) throw this.notFound('Business not found');
    const brandColor = this.safeBrandColor(bookingSettings?.brandColor);
    return {
      ...this.settingsShape(settings),
      businessName: business.name,
      businessSlug: business.slug,
      locale: business.locale,
      branding: {
        brandColor,
        colorSource: brandColor ? 'Booking Link settings' : 'Not configured',
        logoUrl: this.safeExternalUrl(masterListing?.logoUrl),
        logoSource: masterListing?.logoUrl
          ? 'Business Listings'
          : 'Not configured',
      },
      publicUrl: `/portal/${business.slug}/login`,
      customDomain: 'Not available in the customer portal',
      authentication: {
        method: 'Email and password',
        customerMfa: 'Not available in customer portal accounts',
        contactVerification:
          'Not configured for customer portal email or phone changes',
        sessionDays: CUSTOMER_PORTAL_SESSION_DAYS,
      },
    };
  }

  async updateSettings(businessId: string, dto: CustomerPortalSettingsDto) {
    const features = this.normalizeFeatures(dto.enabledFeatures);
    const previous =
      await this.tenantPrisma.client.customerPortalSettings.findUnique({
        where: { businessId },
      });
    const settings =
      await this.tenantPrisma.client.customerPortalSettings.upsert({
        where: { businessId },
        create: {
          businessId,
          enabled: dto.enabled,
          enabledFeatures: features as Prisma.InputJsonValue,
          inviteExpiryHours: dto.inviteExpiryHours,
          termsUrl: dto.termsUrl?.trim() || null,
          privacyUrl: dto.privacyUrl?.trim() || null,
        },
        update: {
          enabled: dto.enabled,
          enabledFeatures: features as Prisma.InputJsonValue,
          inviteExpiryHours: dto.inviteExpiryHours,
          termsUrl: dto.termsUrl?.trim() || null,
          privacyUrl: dto.privacyUrl?.trim() || null,
        },
      });
    await this.audit.log({
      entity: 'CustomerPortalSettings',
      entityId: settings.id,
      action: 'customer.portal_settings_updated',
      before: this.settingsShape(previous),
      after: this.settingsShape(settings),
    });
    return this.settingsShape(settings);
  }

  async listAccounts(businessId: string) {
    const now = new Date();
    const [accounts, invites, inviteCandidates] = await Promise.all([
      this.tenantPrisma.client.customerPortalAccount.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          active: true,
          lastSignedInAt: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              status: true,
            },
          },
          sessions: {
            where: { revokedAt: null, expiresAt: { gt: now } },
            select: {
              id: true,
              createdAt: true,
              lastUsedAt: true,
              expiresAt: true,
            },
          },
        },
      }),
      this.tenantPrisma.client.customerPortalInvite.findMany({
        where: {
          businessId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          customerId: true,
          expiresAt: true,
          createdAt: true,
          customer: { select: { name: true, email: true } },
        },
      }),
      this.tenantPrisma.client.customer.findMany({
        where: {
          status: CustomerStatus.active,
          email: { not: null },
          portalAccount: null,
          portalInvites: {
            none: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
          },
        },
        orderBy: { name: 'asc' },
        take: 100,
        select: { id: true, name: true, email: true, phone: true, tags: true },
      }),
    ]);
    return { accounts, pendingInvites: invites, inviteCandidates };
  }

  async createInvite(
    businessId: string,
    actorUserId: string,
    customerId: string,
  ) {
    const [business, settings, customer, existingAccount] = await Promise.all([
      this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { slug: true },
      }),
      this.tenantPrisma.client.customerPortalSettings.findUnique({
        where: { businessId },
      }),
      this.tenantPrisma.client.customer.findFirst({
        where: { id: customerId },
        select: { id: true, email: true, status: true },
      }),
      this.tenantPrisma.client.customerPortalAccount.findFirst({
        where: { customerId },
      }),
    ]);
    if (!business || !settings?.enabled) throw this.portalUnavailable();
    if (!customer) throw this.notFound('Customer not found in this business');
    if (customer.status !== CustomerStatus.active) {
      throw new AppException(
        'PORTAL_CUSTOMER_INACTIVE',
        'Only active customers can be invited to the portal.',
        HttpStatus.CONFLICT,
      );
    }
    if (!customer.email?.trim()) {
      throw new AppException(
        'PORTAL_EMAIL_REQUIRED',
        'Add an email address to this customer record before creating an invite.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const emailAlreadyHasAccount =
      await this.tenantPrisma.client.customerPortalAccount.findFirst({
        where: { businessId, customer: { email: customer.email } },
        select: { id: true },
      });
    if (emailAlreadyHasAccount) {
      throw new AppException(
        'PORTAL_EMAIL_IN_USE',
        'Another portal account already uses this email address in this business.',
        HttpStatus.CONFLICT,
      );
    }
    const emailHasPendingInvite =
      await this.tenantPrisma.client.customerPortalInvite.findFirst({
        where: {
          businessId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          customer: { is: { email: customer.email, id: { not: customer.id } } },
        },
        select: { id: true },
      });
    if (emailHasPendingInvite) {
      throw new AppException(
        'PORTAL_EMAIL_IN_USE',
        'Another pending customer invitation already uses this email address.',
        HttpStatus.CONFLICT,
      );
    }
    if (existingAccount) {
      throw new AppException(
        'PORTAL_ACCOUNT_EXISTS',
        'This customer already has a portal account.',
        HttpStatus.CONFLICT,
      );
    }

    const token = randomBytes(HASHED_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(
      Date.now() + settings.inviteExpiryHours * 60 * 60 * 1000,
    );
    const invite = await this.prisma.$transaction(async (tx) => {
      await tx.customerPortalInvite.updateMany({
        where: { businessId, customerId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.customerPortalInvite.create({
        data: {
          businessId,
          customerId,
          createdByUserId: actorUserId,
          tokenHash: this.hashToken(token),
          expiresAt,
        },
        select: { id: true, expiresAt: true },
      });
    });
    await this.audit.log({
      entity: 'CustomerPortalInvite',
      entityId: invite.id,
      action: 'customer.portal_invite_created',
      after: {
        customerId,
        expiresAt: invite.expiresAt,
        delivery: 'manual_share',
      },
    });
    return {
      id: invite.id,
      expiresAt: invite.expiresAt,
      invitePath: `/portal/${business.slug}/accept?token=${encodeURIComponent(token)}`,
      delivery: 'Manual share — Noxtill did not send an email.',
    };
  }

  async revokeInvite(businessId: string, inviteId: string) {
    const invite =
      await this.tenantPrisma.client.customerPortalInvite.findFirst({
        where: { id: inviteId, businessId, acceptedAt: null, revokedAt: null },
        select: { id: true, customerId: true, expiresAt: true },
      });
    if (!invite) throw this.notFound('Pending invite not found');
    const result =
      await this.tenantPrisma.client.customerPortalInvite.updateMany({
        where: { id: inviteId, businessId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    if (!result.count) throw this.notFound('Pending invite not found');
    await this.audit.log({
      entity: 'CustomerPortalInvite',
      entityId: invite.id,
      action: 'customer.portal_invite_revoked',
      before: { customerId: invite.customerId, expiresAt: invite.expiresAt },
      after: { revoked: true },
    });
    return { revoked: true };
  }

  async setAccountActive(
    businessId: string,
    accountId: string,
    active: boolean,
  ) {
    const previous =
      await this.tenantPrisma.client.customerPortalAccount.findFirst({
        where: { id: accountId, businessId },
        select: { id: true, customerId: true, active: true },
      });
    if (!previous) throw this.notFound('Portal account not found');
    const result =
      await this.tenantPrisma.client.customerPortalAccount.updateMany({
        where: { id: accountId, businessId },
        data: { active },
      });
    if (!result.count) throw this.notFound('Portal account not found');
    if (!active) {
      await this.tenantPrisma.client.customerPortalSession.updateMany({
        where: { businessId, accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log({
      entity: 'CustomerPortalAccount',
      entityId: accountId,
      action: 'customer.portal_account_status_changed',
      before: { customerId: previous.customerId, active: previous.active },
      after: { customerId: previous.customerId, active },
    });
    return { id: accountId, active };
  }

  async listLayoutVersions(businessId: string) {
    const versions =
      await this.tenantPrisma.client.customerPortalLayoutVersion.findMany({
        where: { businessId },
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          layout: true,
          status: true,
          publishedAt: true,
          createdAt: true,
        },
      });
    return versions.map((version) => ({
      ...version,
      layout: this.normalizeLayout(version.layout),
    }));
  }

  async saveLayoutDraft(
    businessId: string,
    actorUserId: string,
    dto: CustomerPortalLayoutDto,
  ) {
    const layout = this.normalizeLayout(dto);
    const draft = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
      const latest = await tx.customerPortalLayoutVersion.findFirst({
        where: { businessId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      return tx.customerPortalLayoutVersion.create({
        data: {
          businessId,
          version: (latest?.version ?? 0) + 1,
          status: 'draft',
          layout,
          createdByUserId: actorUserId,
        },
        select: {
          id: true,
          version: true,
          layout: true,
          status: true,
          createdAt: true,
        },
      });
    });
    await this.audit.log({
      entity: 'CustomerPortalLayoutVersion',
      entityId: draft.id,
      action: 'customer.portal_layout_draft_saved',
      after: {
        version: draft.version,
        layout: draft.layout,
        status: draft.status,
      },
    });
    return draft;
  }

  async publishLayout(businessId: string, version: number) {
    const target =
      await this.tenantPrisma.client.customerPortalLayoutVersion.findFirst({
        where: { businessId, version },
      });
    if (!target) throw this.notFound('Layout version not found');
    const previousPublished =
      await this.tenantPrisma.client.customerPortalLayoutVersion.findFirst({
        where: { businessId, status: 'published' },
        orderBy: { version: 'desc' },
        select: { id: true, version: true },
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
      await tx.customerPortalLayoutVersion.updateMany({
        where: { businessId, status: 'published' },
        data: { status: 'archived' },
      });
      await tx.customerPortalLayoutVersion.update({
        where: { id: target.id },
        data: { status: 'published', publishedAt: new Date() },
      });
    });
    await this.audit.log({
      entity: 'CustomerPortalLayoutVersion',
      entityId: target.id,
      action: 'customer.portal_layout_published',
      before: previousPublished
        ? { version: previousPublished.version, status: 'published' }
        : null,
      after: { version: target.version, status: 'published' },
    });
    return { id: target.id, version: target.version, status: 'published' };
  }

  async restoreLayout(
    businessId: string,
    actorUserId: string,
    version: number,
  ) {
    const previous =
      await this.tenantPrisma.client.customerPortalLayoutVersion.findFirst({
        where: { businessId, version },
        select: { layout: true },
      });
    if (!previous) throw this.notFound('Layout version not found');
    const cards = (previous.layout as { cards?: unknown })?.cards;
    if (!Array.isArray(cards))
      throw new AppException(
        'PORTAL_LAYOUT_INVALID',
        'This version has no valid card layout.',
        HttpStatus.CONFLICT,
      );
    return this.saveLayoutDraft(
      businessId,
      actorUserId,
      this.normalizeLayout(previous.layout),
    );
  }

  async getPublicBootstrap(slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        locale: true,
      },
    });
    if (!business) throw this.portalUnavailable();
    const [settings, bookingSettings, masterListing] = await Promise.all([
      this.prisma.customerPortalSettings.findUnique({
        where: { businessId: business.id },
      }),
      this.prisma.bookingLinkSettings.findUnique({
        where: { businessId: business.id },
        select: { brandColor: true },
      }),
      this.prisma.masterListing.findUnique({
        where: { businessId: business.id },
        select: { logoUrl: true },
      }),
    ]);
    if (!settings?.enabled) throw this.portalUnavailable();
    return {
      business: {
        name: business.name,
        slug: business.slug,
        currency: business.currency,
        locale: business.locale,
      },
      brandColor: this.safeBrandColor(bookingSettings?.brandColor),
      logoUrl: this.safeExternalUrl(masterListing?.logoUrl),
      enabledFeatures: this.normalizeFeatures(settings.enabledFeatures),
      termsUrl: settings.termsUrl,
      privacyUrl: settings.privacyUrl,
    };
  }

  async acceptInvite(slug: string, dto: CustomerPortalAcceptInviteDto) {
    const invite = await this.prisma.customerPortalInvite.findUnique({
      where: { tokenHash: this.hashToken(dto.token) },
      include: { customer: true, business: { select: { slug: true } } },
    });
    const now = new Date();
    if (
      !invite ||
      invite.business.slug !== slug ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt <= now
    ) {
      throw new AppException(
        'PORTAL_INVITE_INVALID',
        'This invite is invalid or expired. Ask the business for a new one.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const settings = await this.prisma.customerPortalSettings.findUnique({
      where: { businessId: invite.businessId },
    });
    if (
      !settings?.enabled ||
      invite.customer.status !== CustomerStatus.active ||
      !invite.customer.email
    ) {
      throw this.portalUnavailable();
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    let account: CustomerPortalAccount;
    try {
      account = await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.customerPortalInvite.updateMany({
          where: {
            id: invite.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { acceptedAt: now },
        });
        if (!consumed.count)
          throw new AppException(
            'PORTAL_INVITE_INVALID',
            'This invite has already been used or expired.',
            HttpStatus.CONFLICT,
          );
        return tx.customerPortalAccount.create({
          data: {
            businessId: invite.businessId,
            customerId: invite.customerId,
            passwordHash,
          },
        });
      });
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        'PORTAL_ACCOUNT_EXISTS',
        'A portal account already exists for this customer.',
        HttpStatus.CONFLICT,
      );
    }
    await this.recordActivity(
      invite.businessId,
      invite.customerId,
      account.id,
      'account_created',
    );
    return this.createSession(account.id, invite.businessId);
  }

  async login(dto: CustomerPortalLoginDto) {
    const business = await this.prisma.business.findUnique({
      where: { slug: dto.businessSlug },
      select: { id: true },
    });
    if (!business) throw this.invalidCredentials();
    const settings = await this.prisma.customerPortalSettings.findUnique({
      where: { businessId: business.id },
    });
    if (!settings?.enabled) throw this.invalidCredentials();
    const matches = await this.prisma.customer.findMany({
      where: {
        businessId: business.id,
        email: dto.email.trim(),
        portalAccount: { is: { active: true } },
      },
      take: 2,
      select: { id: true, status: true },
    });
    const customer = matches.length === 1 ? matches[0] : null;
    const account = customer
      ? await this.prisma.customerPortalAccount.findUnique({
          where: { customerId: customer.id },
        })
      : null;
    const now = new Date();
    if (account?.lockedUntil && account.lockedUntil > now) {
      await this.recordActivity(
        business.id,
        customer!.id,
        account.id,
        'login_blocked',
      );
      throw this.invalidCredentials();
    }
    const valid =
      !!account &&
      account.active &&
      customer?.status === CustomerStatus.active &&
      (await bcrypt.compare(dto.password, account.passwordHash));
    if (!valid || !account || !customer) {
      if (account) {
        const failedLoginAttempts = account.failedLoginAttempts + 1;
        await this.prisma.customerPortalAccount.update({
          where: { id: account.id },
          data: {
            failedLoginAttempts,
            lockedUntil:
              failedLoginAttempts >= CUSTOMER_PORTAL_MAX_LOGIN_ATTEMPTS
                ? new Date(
                    now.getTime() + CUSTOMER_PORTAL_LOCK_MINUTES * 60_000,
                  )
                : account.lockedUntil,
          },
        });
        await this.recordActivity(
          business.id,
          customer!.id,
          account.id,
          'login_failed',
        );
      }
      throw this.invalidCredentials();
    }
    await this.prisma.customerPortalAccount.update({
      where: { id: account.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastSignedInAt: now },
    });
    await this.recordActivity(
      business.id,
      customer.id,
      account.id,
      'signed_in',
    );
    return this.createSession(account.id, business.id);
  }

  async logout(authorization?: string) {
    const raw = this.readBearer(authorization);
    if (raw) {
      await this.prisma.customerPortalSession.updateMany({
        where: { tokenHash: this.hashToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { signedOut: true };
  }

  async getMe(authorization?: string) {
    const identity = await this.requireIdentity(authorization, 'account');
    const [customer, dataRequests] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: identity.customerId, businessId: identity.businessId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          birthday: true,
          consentMarketing: true,
          createdAt: true,
        },
      }),
      this.prisma.dataSubjectRequest.findMany({
        where: {
          businessId: identity.businessId,
          customerId: identity.customerId,
          kind: DsrRequestKind.export,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          createdAt: true,
          fulfilledAt: true,
          resultUrl: true,
        },
      }),
    ]);
    return { identity, customer, dataRequests };
  }

  async requestDataExport(authorization?: string) {
    const identity = await this.requireIdentity(authorization, 'account');
    this.cls.set(CLS_KEY_BUSINESS_ID, identity.businessId);
    const request = await this.prisma.$transaction(async (tx) => {
      // Serialize customer retries so double-clicks/network retries reuse one open request.
      await tx.$queryRaw`SELECT id FROM customer_portal_accounts WHERE id = ${identity.accountId} FOR UPDATE`;
      const open = await tx.dataSubjectRequest.findFirst({
        where: {
          businessId: identity.businessId,
          customerId: identity.customerId,
          kind: DsrRequestKind.export,
          status: {
            in: [DsrRequestStatus.pending, DsrRequestStatus.in_progress],
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (open) return { request: open, created: false };
      const created = await tx.dataSubjectRequest.create({
        data: {
          businessId: identity.businessId,
          customerId: identity.customerId,
          kind: DsrRequestKind.export,
          note: 'Requested by the customer from the authenticated portal.',
        },
      });
      return { request: created, created: true };
    });
    if (request.created) {
      await this.audit.log({
        entity: 'DataSubjectRequest',
        entityId: request.request.id,
        action: 'customer.portal_data_export_requested',
        after: {
          businessId: identity.businessId,
          customerId: identity.customerId,
          kind: request.request.kind,
          status: request.request.status,
        },
      });
      await this.recordActivity(
        identity.businessId,
        identity.customerId,
        identity.accountId,
        'data_export_requested',
        'DataSubjectRequest',
        request.request.id,
      );
    }
    return {
      id: request.request.id,
      status: request.request.status,
      createdAt: request.request.createdAt,
      reusedOpenRequest: !request.created,
    };
  }

  async getHome(authorization?: string) {
    const identity = await this.requireIdentity(authorization);
    const now = new Date();
    const [settings, publishedLayout] = await Promise.all([
      this.prisma.customerPortalSettings.findUnique({
        where: { businessId: identity.businessId },
      }),
      this.prisma.customerPortalLayoutVersion.findFirst({
        where: { businessId: identity.businessId, status: 'published' },
        orderBy: { version: 'desc' },
        select: { layout: true },
      }),
    ]);
    const configuredLayout = this.normalizeLayout(
      publishedLayout?.layout ?? { cards: [...CUSTOMER_PORTAL_HOME_CARDS] },
    );
    const visibleCards = configuredLayout.cards.filter(
      (card) =>
        identity.enabledFeatures.includes(card) &&
        this.isVisibleForCustomer(
          card,
          configuredLayout.visibilityRules,
          identity.customerTags,
        ),
    );
    // Only return data for cards the customer is currently allowed to see.
    // The individual feature APIs enforce enabledFeatures too, but this summary
    // endpoint must not become a side door around layout or segment visibility.
    const [orders, appointments] = await Promise.all([
      visibleCards.includes('orders')
        ? this.prisma.order.findMany({
            where: {
              businessId: identity.businessId,
              customerId: identity.customerId,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              orderNo: true,
              status: true,
              total: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      visibleCards.includes('bookings')
        ? this.prisma.appointment.findMany({
            where: {
              businessId: identity.businessId,
              customerId: identity.customerId,
              startsAt: { gte: now },
              status: { not: AppointmentStatus.cancelled },
            },
            orderBy: { startsAt: 'asc' },
            take: 5,
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              status: true,
              service: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ]);
    const layout = {
      ...configuredLayout,
      cards: visibleCards,
      quickActions: configuredLayout.quickActions.filter(
        (action) =>
          visibleCards.includes(action.destination) &&
          identity.enabledFeatures.includes(action.destination) &&
          this.isVisibleForCustomer(
            action.destination,
            configuredLayout.visibilityRules,
            identity.customerTags,
          ),
      ),
      announcements: configuredLayout.announcements.filter(
        (item) => item.enabled,
      ),
    };
    return {
      businessName: identity.businessName,
      customerName: identity.customerName,
      orders,
      upcomingAppointments: appointments,
      enabledFeatures: identity.enabledFeatures,
      layout,
      support: {
        available: false,
        reason:
          'Not available — this business has no customer support ticket service in Noxtill yet.',
      },
      billing: {
        onlinePayment: false,
        reason:
          'Not configured — customer one-off invoice payments are not available.',
      },
      legal: {
        termsUrl: settings?.termsUrl ?? null,
        privacyUrl: settings?.privacyUrl ?? null,
      },
    };
  }

  async updateProfile(
    authorization: string | undefined,
    dto: CustomerPortalProfileDto,
  ) {
    const identity = await this.requireIdentity(authorization, 'account');
    const previous = await this.prisma.customer.findFirst({
      where: { id: identity.customerId, businessId: identity.businessId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        consentMarketing: true,
      },
    });
    if (!previous) throw this.notFound('Customer not found');
    if (
      (dto.email !== undefined &&
        (dto.email?.trim().toLowerCase() || null) !== previous.email) ||
      (dto.phone !== undefined && dto.phone.trim() !== previous.phone)
    ) {
      throw new AppException(
        'PORTAL_CONTACT_VERIFICATION_UNAVAILABLE',
        'Email and phone changes require verification, which is not configured for this portal. Contact the business to update these details.',
        HttpStatus.CONFLICT,
      );
    }
    if (dto.email?.trim()) {
      const duplicateEmail = await this.prisma.customer.findFirst({
        where: {
          businessId: identity.businessId,
          id: { not: identity.customerId },
          email: dto.email.trim().toLowerCase(),
          portalAccount: { is: { active: true } },
        },
        select: { id: true },
      });
      if (duplicateEmail)
        throw new AppException(
          'PORTAL_EMAIL_IN_USE',
          'Another active portal account already uses that email address.',
          HttpStatus.CONFLICT,
        );
    }
    if (dto.phone) {
      const duplicate = await this.prisma.customer.findFirst({
        where: {
          businessId: identity.businessId,
          phone: dto.phone,
          id: { not: identity.customerId },
        },
        select: { id: true },
      });
      if (duplicate)
        throw new AppException(
          'PORTAL_PHONE_IN_USE',
          'That phone number is already used by another customer record.',
          HttpStatus.CONFLICT,
        );
    }
    const customer = await this.prisma.customer.update({
      where: { id: identity.customerId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim().toLowerCase() || null }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.address !== undefined
          ? { address: dto.address?.trim() || null }
          : {}),
        ...(dto.consentMarketing !== undefined
          ? { consentMarketing: dto.consentMarketing }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        birthday: true,
        consentMarketing: true,
        createdAt: true,
      },
    });
    await this.audit.log({
      entity: 'Customer',
      entityId: customer.id,
      action: 'customer.portal_profile_updated',
      before: previous,
      after: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        consentMarketing: customer.consentMarketing,
      },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      dto.consentMarketing !== undefined &&
        dto.consentMarketing !== previous.consentMarketing
        ? 'marketing_consent_updated'
        : 'profile_updated',
    );
    return customer;
  }

  async getOrders(
    authorization?: string,
    pagination: CustomerPortalPaginationDto = {},
  ) {
    const identity = await this.requireIdentity(authorization, 'orders');
    const limit = this.portalPageLimit(pagination.limit);
    const rows = await this.prisma.order.findMany({
      where: {
        businessId: identity.businessId,
        customerId: identity.customerId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(pagination.cursor
        ? { cursor: { id: pagination.cursor }, skip: 1 }
        : {}),
      select: {
        id: true,
        orderNo: true,
        orderType: true,
        status: true,
        subtotal: true,
        tax: true,
        discount: true,
        total: true,
        createdAt: true,
        isQuotation: true,
        quotationStatus: true,
        quotationValidUntil: true,
        items: { select: { id: true, name: true, price: true, qty: true } },
        payments: {
          select: { id: true, method: true, amount: true, createdAt: true },
        },
        returns: { select: { status: true } },
        delivery: {
          select: {
            status: true,
            promisedAt: true,
            deliveredAt: true,
            trackingToken: true,
          },
        },
      },
    });
    const page = this.cursorPage(rows, limit);
    return {
      ...page,
      items: page.items.map((order) => ({
        ...order,
        quotationStatus: this.portalQuotationStatus(order),
        paymentStatus: derivePaymentStatus(order),
      })),
    };
  }

  async createReorderDraft(authorization: string | undefined, orderId: string) {
    const identity = await this.requireIdentity(authorization, 'orders');
    const source = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        businessId: identity.businessId,
        customerId: identity.customerId,
        isQuotation: false,
      },
      select: {
        id: true,
        orderNo: true,
        items: {
          select: {
            productId: true,
            qty: true,
            product: { select: { active: true } },
          },
        },
      },
    });
    if (!source) throw this.notFound('Order not found for this customer');
    if (
      source.items.length === 0 ||
      source.items.some((item) => !item.productId || !item.product?.active)
    ) {
      throw new AppException(
        'PORTAL_REORDER_UNAVAILABLE',
        'This order contains items that are no longer available to reorder.',
        HttpStatus.CONFLICT,
      );
    }
    const draft = await this.orders.createDraft(identity.businessId, {
      customerId: identity.customerId,
      orderType: 'online',
      items: source.items.map((item) => ({
        productId: item.productId!,
        qty: item.qty,
      })),
    });
    await this.audit.log({
      entity: 'Order',
      entityId: draft.id,
      action: 'customer.portal_reorder_draft_created',
      after: { sourceOrderId: source.id, sourceOrderNo: source.orderNo },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'reorder_draft_created',
      'Order',
      draft.id,
    );
    return {
      id: draft.id,
      orderNo: draft.orderNo,
      status: draft.status,
      total: draft.total,
    };
  }

  async downloadReceipt(authorization: string | undefined, orderId: string) {
    const identity = await this.requireIdentity(authorization, 'billing');
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        businessId: identity.businessId,
        customerId: identity.customerId,
        isQuotation: false,
      },
      select: { id: true, orderNo: true },
    });
    if (!order) throw this.notFound('Receipt not found for this customer');
    const result = await this.invoices.generate(identity.businessId, order.id);
    await this.audit.log({
      entity: 'Order',
      entityId: order.id,
      action: 'customer.portal_receipt_generated',
      after: { orderNo: order.orderNo },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'receipt_generated',
      'Order',
      order.id,
    );
    return result;
  }

  async getBookings(
    authorization?: string,
    pagination: CustomerPortalPaginationDto = {},
  ) {
    const identity = await this.requireIdentity(authorization, 'bookings');
    const limit = this.portalPageLimit(pagination.limit);
    const [appointments, waitlist, queue] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          businessId: identity.businessId,
          customerId: identity.customerId,
        },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(pagination.appointmentsCursor
          ? { cursor: { id: pagination.appointmentsCursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          depositPaid: true,
          service: { select: { name: true } },
        },
      }),
      this.prisma.waitlistEntry.findMany({
        where: {
          businessId: identity.businessId,
          customerId: identity.customerId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(pagination.waitlistCursor
          ? { cursor: { id: pagination.waitlistCursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          status: true,
          preferredFrom: true,
          preferredTo: true,
          offeredStartsAt: true,
          offeredEndsAt: true,
          service: { select: { name: true } },
        },
      }),
      this.prisma.queueToken.findMany({
        where: {
          businessId: identity.businessId,
          customerId: identity.customerId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(pagination.queueCursor
          ? { cursor: { id: pagination.queueCursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          number: true,
          status: true,
          calledAt: true,
          servedAt: true,
          createdAt: true,
          service: { select: { name: true } },
        },
      }),
    ]);
    const appointmentPage = this.cursorPage(appointments, limit);
    const waitlistPage = this.cursorPage(waitlist, limit);
    const queuePage = this.cursorPage(queue, limit);
    return {
      appointments: appointmentPage.items,
      waitlist: waitlistPage.items,
      queue: queuePage.items,
      pagination: {
        appointments: this.pageInfo(appointmentPage),
        waitlist: this.pageInfo(waitlistPage),
        queue: this.pageInfo(queuePage),
      },
    };
  }

  async cancelBooking(
    authorization: string | undefined,
    appointmentId: string,
  ) {
    const identity = await this.requireIdentity(authorization, 'bookings');
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        businessId: identity.businessId,
        customerId: identity.customerId,
      },
      select: { id: true, rescheduleToken: true },
    });
    if (!appointment?.rescheduleToken)
      throw this.notFound(
        'Booking cannot be changed from this portal. Contact the business.',
      );
    const updated = await this.bookings.cancel(appointment.rescheduleToken);
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'booking_cancelled',
      'Appointment',
      appointmentId,
    );
    return { id: updated.id, status: updated.status };
  }

  async rescheduleBooking(
    authorization: string | undefined,
    appointmentId: string,
    startsAt: string,
  ) {
    const identity = await this.requireIdentity(authorization, 'bookings');
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        businessId: identity.businessId,
        customerId: identity.customerId,
      },
      select: { id: true, rescheduleToken: true },
    });
    if (!appointment?.rescheduleToken)
      throw this.notFound(
        'Booking cannot be changed from this portal. Contact the business.',
      );
    const updated = await this.bookings.reschedule(
      appointment.rescheduleToken,
      startsAt,
    );
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'booking_rescheduled',
      'Appointment',
      appointmentId,
    );
    return {
      id: updated.id,
      startsAt: updated.startsAt,
      endsAt: updated.endsAt,
      status: updated.status,
    };
  }

  async listBookableServices(authorization?: string) {
    const identity = await this.requireIdentity(authorization, 'bookings');
    const services = await this.bookings.listServices(identity.businessSlug);
    return services.map((service) => ({
      id: service.id,
      name: service.name,
      durationMin: service.durationMin,
      price: service.sellingPrice.toString(),
    }));
  }

  async getBookableSlots(
    authorization: string | undefined,
    serviceId: string,
    date: string,
  ) {
    const identity = await this.requireIdentity(authorization, 'bookings');
    const services = await this.bookings.listServices(identity.businessSlug);
    if (!services.some((service) => service.id === serviceId))
      throw this.notFound('Bookable service not found');
    return this.bookings.getSlots(identity.businessSlug, {
      service: serviceId,
      date,
    });
  }

  async createPortalBooking(
    authorization: string | undefined,
    dto: CustomerPortalBookAppointmentDto,
  ) {
    const identity = await this.requireIdentity(authorization, 'bookings');
    const appointment = await this.bookings.createBookingForCustomer(
      identity.businessId,
      identity.customerId,
      dto.serviceId,
      dto.startsAt,
    );
    await this.audit.log({
      entity: 'Appointment',
      entityId: appointment.id,
      action: 'customer.portal_booking_created',
      after: { serviceId: dto.serviceId, startsAt: appointment.startsAt },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'booking_created',
      'Appointment',
      appointment.id,
    );
    return {
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
    };
  }

  async joinPortalWaitlist(
    authorization: string | undefined,
    dto: CustomerPortalWaitlistDto,
  ) {
    const identity = await this.requireIdentity(authorization, 'bookings');
    const entry = await this.waitlist.joinForCustomer(
      identity.businessId,
      identity.customerId,
      dto,
    );
    await this.audit.log({
      entity: 'WaitlistEntry',
      entityId: entry.id,
      action: 'customer.portal_waitlist_joined',
      after: { serviceId: entry.serviceId },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'waitlist_joined',
      'WaitlistEntry',
      entry.id,
    );
    return { id: entry.id, status: entry.status };
  }

  async joinPortalQueue(authorization: string | undefined, serviceId?: string) {
    const identity = await this.requireIdentity(authorization, 'bookings');
    if (serviceId) {
      const services = await this.bookings.listServices(identity.businessSlug);
      if (!services.some((service) => service.id === serviceId))
        throw this.notFound('Bookable service not found');
    }
    const token = await this.queue.join(identity.businessId, {
      customerId: identity.customerId,
      customerName: identity.customerName,
      serviceId,
    });
    await this.audit.log({
      entity: 'QueueToken',
      entityId: token.id,
      action: 'customer.portal_queue_joined',
      after: { number: token.number, serviceId: token.serviceId },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'queue_joined',
      'QueueToken',
      token.id,
    );
    return { id: token.id, number: token.number, status: token.status };
  }

  async getBilling(
    authorization?: string,
    pagination: CustomerPortalPaginationDto = {},
  ) {
    const identity = await this.requireIdentity(authorization, 'billing');
    const limit = this.portalPageLimit(pagination.limit);
    const [quotes, receipts] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          businessId: identity.businessId,
          customerId: identity.customerId,
          isQuotation: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(pagination.quotesCursor
          ? { cursor: { id: pagination.quotesCursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          orderNo: true,
          status: true,
          total: true,
          createdAt: true,
          isQuotation: true,
          quotationStatus: true,
          quotationValidUntil: true,
          items: { select: { name: true, qty: true, price: true } },
          payments: {
            select: { id: true, amount: true, method: true, createdAt: true },
          },
          returns: { select: { status: true } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          businessId: identity.businessId,
          customerId: identity.customerId,
          isQuotation: false,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(pagination.ordersCursor
          ? { cursor: { id: pagination.ordersCursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          orderNo: true,
          status: true,
          total: true,
          createdAt: true,
          isQuotation: true,
          quotationStatus: true,
          quotationValidUntil: true,
          items: { select: { name: true, qty: true, price: true } },
          payments: {
            select: { id: true, amount: true, method: true, createdAt: true },
          },
          returns: { select: { status: true } },
        },
      }),
    ]);
    const quotesPage = this.cursorPage(quotes, limit);
    const receiptsPage = this.cursorPage(receipts, limit);
    const moneyShape = (order: (typeof quotes)[number]) => {
      const amountPaid = order.payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );
      const paymentStatus = derivePaymentStatus(order);
      return {
        ...order,
        quotationStatus: this.portalQuotationStatus(order),
        paymentStatus,
        amountPaid,
        amountDue:
          paymentStatus === 'refunded'
            ? null
            : Math.max(0, Number(order.total) - amountPaid),
      };
    };
    return {
      quotes: quotesPage.items.map(moneyShape),
      ordersAndReceipts: receiptsPage.items.map(moneyShape),
      pagination: {
        quotes: this.pageInfo(quotesPage),
        ordersAndReceipts: this.pageInfo(receiptsPage),
      },
      onlineInvoicePayment: {
        available: false,
        reason:
          'Not configured — Noxtill has no customer one-off invoice checkout flow.',
      },
      note: 'Order and payment rows are canonical. Invoice PDFs are generated from order records by staff; a customer download link is not stored here.',
    };
  }

  async respondToQuote(
    authorization: string | undefined,
    quoteId: string,
    dto: CustomerPortalQuoteResponseDto,
  ) {
    const identity = await this.requireIdentity(authorization, 'billing');
    const reason = dto.reason?.trim() || null;
    if (dto.response === 'decline' && !reason) {
      throw new AppException(
        'PORTAL_QUOTE_REASON_REQUIRED',
        'Add a short reason before declining this quote.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const quote = await this.prisma.order.findFirst({
      where: {
        id: quoteId,
        businessId: identity.businessId,
        customerId: identity.customerId,
        isQuotation: true,
      },
      select: {
        id: true,
        orderNo: true,
        quotationStatus: true,
        quotationValidUntil: true,
      },
    });
    if (!quote) throw this.notFound('Quote not found for this customer');
    if (
      quote.quotationStatus !== QuotationStatus.sent ||
      (quote.quotationValidUntil && quote.quotationValidUntil < new Date())
    ) {
      throw new AppException(
        'PORTAL_QUOTE_NOT_RESPONDABLE',
        'Only a current sent quote can be accepted or declined.',
        HttpStatus.CONFLICT,
      );
    }
    const now = new Date();
    const nextStatus =
      dto.response === 'accept'
        ? QuotationStatus.accepted
        : QuotationStatus.declined;
    const result = await this.prisma.order.updateMany({
      where: {
        id: quote.id,
        businessId: identity.businessId,
        customerId: identity.customerId,
        isQuotation: true,
        quotationStatus: QuotationStatus.sent,
        OR: [
          { quotationValidUntil: null },
          { quotationValidUntil: { gte: now } },
        ],
      },
      data: {
        quotationStatus: nextStatus,
        ...(dto.response === 'decline' ? { declineReason: reason } : {}),
      },
    });
    if (!result.count) {
      throw new AppException(
        'PORTAL_QUOTE_NOT_RESPONDABLE',
        'This quote has already changed or expired. Refresh and contact the business if you need help.',
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log({
      entity: 'Order',
      entityId: quote.id,
      action:
        dto.response === 'accept'
          ? 'customer.portal_quote_accepted'
          : 'customer.portal_quote_declined',
      before: { quotationStatus: QuotationStatus.sent },
      after: { quotationStatus: nextStatus, reason },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      dto.response === 'accept' ? 'quote_accepted' : 'quote_declined',
      'Order',
      quote.id,
    );
    return {
      id: quote.id,
      orderNo: quote.orderNo,
      quotationStatus: nextStatus,
    };
  }

  async getReturns(
    authorization?: string,
    pagination: CustomerPortalPaginationDto = {},
  ) {
    const identity = await this.requireIdentity(authorization, 'returns');
    const limit = this.portalPageLimit(pagination.limit);
    const [returns, eligibleOrders] = await Promise.all([
      this.prisma.return.findMany({
        where: {
          businessId: identity.businessId,
          customerId: identity.customerId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(pagination.returnsCursor
          ? { cursor: { id: pagination.returnsCursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          reason: true,
          refundMethod: true,
          refundAmount: true,
          status: true,
          createdAt: true,
          order: { select: { orderNo: true } },
          items: { select: { productId: true, qty: true, amount: true } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          businessId: identity.businessId,
          customerId: identity.customerId,
          items: { some: { productId: { not: null } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(pagination.eligibleOrdersCursor
          ? { cursor: { id: pagination.eligibleOrdersCursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          orderNo: true,
          createdAt: true,
          items: {
            select: { productId: true, name: true, qty: true, price: true },
          },
        },
      }),
    ]);
    const returnsPage = this.cursorPage(returns, limit);
    const eligibleOrdersPage = this.cursorPage(eligibleOrders, limit);
    return {
      returns: returnsPage.items,
      eligibleOrders: eligibleOrdersPage.items,
      pagination: {
        returns: this.pageInfo(returnsPage),
        eligibleOrders: this.pageInfo(eligibleOrdersPage),
      },
      warranty: {
        tracked: false,
        reason: 'Not tracked — this system has no warranty claim records.',
      },
      decision:
        'A customer request remains pending until the business reviews it; this portal never issues the refund itself.',
    };
  }

  async requestReturn(authorization: string | undefined, dto: CreateReturnDto) {
    const identity = await this.requireIdentity(authorization, 'returns');
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        businessId: identity.businessId,
        customerId: identity.customerId,
      },
      select: { id: true },
    });
    if (!order) throw this.notFound('Order not found for this customer');
    this.cls.set(CLS_KEY_BUSINESS_ID, identity.businessId);
    const result = await this.returns.create(identity.businessId, dto);
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'return_requested',
      'Return',
      result.id,
    );
    return {
      id: result.id,
      orderId: result.orderId,
      reason: result.reason,
      refundMethod: result.refundMethod,
      refundAmount: result.refundAmount,
      status: result.status,
      items: result.items,
    };
  }

  async getSupport(authorization?: string) {
    await this.requireIdentity(authorization, 'support');
    return {
      available: false,
      reason:
        'Not available — the existing messaging service sends business-initiated notifications and does not store customer support conversations or tickets.',
    };
  }

  async getLoyalty(
    authorization?: string,
    pagination: CustomerPortalPaginationDto = {},
  ) {
    const identity = await this.requireIdentity(authorization, 'loyalty');
    const limit = this.portalPageLimit(pagination.limit);
    const [loyaltyRows, memberships, subscriptions, preorders] =
      await Promise.all([
        this.prisma.loyaltyMember.findMany({
          where: {
            businessId: identity.businessId,
            customerId: identity.customerId,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(pagination.loyaltyCursor
            ? { cursor: { id: pagination.loyaltyCursor }, skip: 1 }
            : {}),
          select: {
            id: true,
            stampCount: true,
            redeemedCount: true,
            program: {
              select: {
                id: true,
                name: true,
                type: true,
                stampsRequired: true,
                rewardDescription: true,
                tiers: true,
                active: true,
              },
            },
            stamps: {
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: { redeemed: true, createdAt: true },
            },
            customer: { select: { lifetimeSpend: true } },
          },
        }),
        this.prisma.membership.findMany({
          where: {
            businessId: identity.businessId,
            customerId: identity.customerId,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(pagination.membershipsCursor
            ? { cursor: { id: pagination.membershipsCursor }, skip: 1 }
            : {}),
          select: {
            id: true,
            status: true,
            method: true,
            currentPeriodEnd: true,
            createdAt: true,
            plan: {
              select: {
                name: true,
                price: true,
                interval: true,
                benefits: true,
              },
            },
          },
        }),
        this.prisma.commerceSubscription.findMany({
          where: {
            businessId: identity.businessId,
            customerId: identity.customerId,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(pagination.subscriptionsCursor
            ? { cursor: { id: pagination.subscriptionsCursor }, skip: 1 }
            : {}),
          select: {
            id: true,
            status: true,
            nextRenewalAt: true,
            skipNextCycle: true,
            createdAt: true,
            plan: {
              select: {
                name: true,
                interval: true,
                qtyPerCycle: true,
                pricePerUnit: true,
                allowSkip: true,
                product: { select: { name: true, sellingPrice: true } },
              },
            },
          },
        }),
        this.prisma.commercePreorder.findMany({
          where: {
            businessId: identity.businessId,
            customerId: identity.customerId,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(pagination.preordersCursor
            ? { cursor: { id: pagination.preordersCursor }, skip: 1 }
            : {}),
          select: {
            id: true,
            qty: true,
            status: true,
            promisedDate: true,
            createdAt: true,
            campaign: {
              select: { name: true, product: { select: { name: true } } },
            },
          },
        }),
      ]);
    const loyaltyPage = this.cursorPage(loyaltyRows, limit);
    const membershipsPage = this.cursorPage(memberships, limit);
    const subscriptionsPage = this.cursorPage(subscriptions, limit);
    const preordersPage = this.cursorPage(preorders, limit);
    const loyalty = loyaltyPage.items.map((member) => {
      const tiers = Array.isArray(member.program.tiers)
        ? member.program.tiers.filter(
            (tier): tier is { name: string; minSpend: number } =>
              typeof tier === 'object' &&
              tier !== null &&
              'name' in tier &&
              typeof tier.name === 'string' &&
              'minSpend' in tier &&
              typeof tier.minSpend === 'number',
          )
        : [];
      const currentTier =
        member.program.type === 'tier'
          ? ([...tiers]
              .sort((left, right) => right.minSpend - left.minSpend)
              .find(
                (tier) =>
                  Number(member.customer.lifetimeSpend) >= tier.minSpend,
              )?.name ?? null)
          : null;
      return {
        id: member.id,
        stampCount: member.stampCount,
        redeemedCount: member.redeemedCount,
        program: member.program,
        stamps: member.stamps,
        currentTier,
      };
    });
    return {
      loyalty,
      memberships: membershipsPage.items,
      subscriptions: subscriptionsPage.items,
      preorders: preordersPage.items,
      pagination: {
        loyalty: this.pageInfo(loyaltyPage),
        memberships: this.pageInfo(membershipsPage),
        subscriptions: this.pageInfo(subscriptionsPage),
        preorders: this.pageInfo(preordersPage),
      },
    };
  }

  async redeemLoyaltyReward(
    authorization: string | undefined,
    memberId: string,
  ) {
    const identity = await this.requireIdentity(authorization, 'loyalty');
    const member = await this.prisma.loyaltyMember.findFirst({
      where: {
        id: memberId,
        businessId: identity.businessId,
        customerId: identity.customerId,
      },
      select: {
        id: true,
        stampCount: true,
        redeemedCount: true,
        program: {
          select: {
            active: true,
            type: true,
            stampsRequired: true,
          },
        },
      },
    });
    if (!member) throw this.notFound('Loyalty membership not found');
    if (!member.program.active) {
      throw new AppException(
        'PORTAL_LOYALTY_PROGRAM_INACTIVE',
        'This loyalty program is no longer active.',
        HttpStatus.CONFLICT,
      );
    }
    this.cls.set(CLS_KEY_BUSINESS_ID, identity.businessId);
    const redeemed = await this.loyalty.redeem(member.id);
    await this.audit.log({
      entity: 'LoyaltyMember',
      entityId: member.id,
      action: 'customer.portal_loyalty_reward_redeemed',
      before: {
        stampCount: member.stampCount,
        redeemedCount: member.redeemedCount,
      },
      after: {
        stampCount: redeemed.stampCount,
        redeemedCount: redeemed.redeemedCount,
      },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'loyalty_reward_redeemed',
      'LoyaltyMember',
      member.id,
    );
    return {
      id: redeemed.id,
      stampCount: redeemed.stampCount,
      redeemedCount: redeemed.redeemedCount,
    };
  }

  async updateCommerceSubscription(
    authorization: string | undefined,
    subscriptionId: string,
    dto: CustomerPortalCommerceSubscriptionActionDto,
  ) {
    const identity = await this.requireIdentity(authorization, 'loyalty');
    const subscription = await this.prisma.commerceSubscription.findFirst({
      where: {
        id: subscriptionId,
        businessId: identity.businessId,
        customerId: identity.customerId,
      },
      select: {
        id: true,
        status: true,
        skipNextCycle: true,
        plan: { select: { allowSkip: true } },
      },
    });
    if (!subscription) throw this.notFound('Subscription not found');
    const reason = dto.reason?.trim() || undefined;
    if (dto.action === 'cancel' && (!reason || reason.length < 3)) {
      throw new AppException(
        'PORTAL_SUBSCRIPTION_REASON_REQUIRED',
        'Enter a reason with at least 3 characters to cancel this subscription.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      (dto.action === 'pause' || dto.action === 'skip_next') &&
      subscription.status !== CommerceSubscriptionStatus.active
    ) {
      throw new AppException(
        'PORTAL_SUBSCRIPTION_NOT_ACTIVE',
        'Only an active subscription can be paused or skipped.',
        HttpStatus.CONFLICT,
      );
    }
    if (dto.action === 'skip_next' && !subscription.plan.allowSkip) {
      throw new AppException(
        'PORTAL_SUBSCRIPTION_SKIP_NOT_ALLOWED',
        'This subscription plan does not allow skipping a cycle.',
        HttpStatus.CONFLICT,
      );
    }
    this.cls.set(CLS_KEY_BUSINESS_ID, identity.businessId);
    const before = {
      status: subscription.status,
      skipNextCycle: subscription.skipNextCycle,
    };
    const updated =
      dto.action === 'pause' ||
      dto.action === 'resume' ||
      dto.action === 'cancel'
        ? await this.commerceSubscriptions.setCustomerSubscriptionStatus(
            identity.businessId,
            identity.customerId,
            subscription.id,
            {
              pause: CommerceSubscriptionStatus.paused,
              resume: CommerceSubscriptionStatus.active,
              cancel: CommerceSubscriptionStatus.cancelled,
            }[dto.action],
            reason,
          )
        : await this.commerceSubscriptions.toggleCustomerSubscriptionSkip(
            identity.businessId,
            identity.customerId,
            subscription.id,
            dto.action === 'skip_next',
          );
    await this.audit.log({
      entity: 'CommerceSubscription',
      entityId: subscription.id,
      action: `customer.portal_subscription_${dto.action}`,
      before,
      after: {
        status: updated.status,
        skipNextCycle: updated.skipNextCycle,
        reason: reason ?? null,
      },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      `subscription_${dto.action}`,
      'CommerceSubscription',
      subscription.id,
    );
    return {
      id: updated.id,
      status: updated.status,
      skipNextCycle: updated.skipNextCycle,
      nextRenewalAt: updated.nextRenewalAt,
    };
  }

  async cancelMembership(
    authorization: string | undefined,
    membershipId: string,
    dto: CustomerPortalMembershipCancelDto,
  ) {
    const identity = await this.requireIdentity(authorization, 'loyalty');
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        businessId: identity.businessId,
        customerId: identity.customerId,
      },
      select: {
        id: true,
        status: true,
        method: true,
        currentPeriodEnd: true,
      },
    });
    if (!membership) throw this.notFound('Membership not found');
    const reason = dto.reason.trim();
    this.cls.set(CLS_KEY_BUSINESS_ID, identity.businessId);
    const updated = await this.memberships.cancel(membership.id);
    await this.audit.log({
      entity: 'Membership',
      entityId: membership.id,
      action: 'customer.portal_membership_cancelled',
      before: {
        status: membership.status,
        method: membership.method,
        currentPeriodEnd: membership.currentPeriodEnd,
      },
      after: { status: updated.status, reason },
    });
    await this.recordActivity(
      identity.businessId,
      identity.customerId,
      identity.accountId,
      'membership_cancelled',
      'Membership',
      membership.id,
    );
    return { id: updated.id, status: updated.status };
  }

  async getActivity(authorization?: string) {
    const identity = await this.requireIdentity(authorization, 'account');
    return this.prisma.customerPortalActivity.findMany({
      where: {
        businessId: identity.businessId,
        customerId: identity.customerId,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        event: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });
  }

  private async requireIdentity(
    authorization?: string,
    requiredFeature?: CustomerPortalFeature,
  ): Promise<PortalIdentity> {
    const token = this.readBearer(authorization);
    if (!token) throw this.invalidSession();
    const now = new Date();
    const session = await this.prisma.customerPortalSession.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { account: { include: { customer: true } }, business: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !session.account.active ||
      session.account.businessId !== session.businessId ||
      session.account.customer.status !== CustomerStatus.active
    ) {
      throw this.invalidSession();
    }
    const settings = await this.prisma.customerPortalSettings.findUnique({
      where: { businessId: session.businessId },
    });
    if (!settings?.enabled) throw this.portalUnavailable();
    this.cls.set(CLS_KEY_BUSINESS_ID, session.businessId);
    await this.prisma.customerPortalSession.update({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });
    const enabledFeatures = this.normalizeFeatures(settings.enabledFeatures);
    if (requiredFeature && !enabledFeatures.includes(requiredFeature)) {
      throw new AppException(
        'PORTAL_FEATURE_DISABLED',
        'This section is not enabled in the customer portal.',
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      businessId: session.businessId,
      businessSlug: session.business.slug,
      businessName: session.business.name,
      customerId: session.account.customerId,
      customerName: session.account.customer.name,
      accountId: session.accountId,
      enabledFeatures,
      currency: session.business.currency,
      locale: session.business.locale,
      customerTags: this.normalizeCustomerTags(session.account.customer.tags),
    };
  }

  private async createSession(accountId: string, businessId: string) {
    const token = randomBytes(HASHED_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(
      Date.now() + CUSTOMER_PORTAL_SESSION_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.prisma.customerPortalSession.create({
      data: {
        accountId,
        businessId,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });
    return { accessToken: token, tokenType: 'Bearer', expiresAt };
  }

  private async recordActivity(
    businessId: string,
    customerId: string,
    accountId: string | null,
    event: string,
    entityType?: string,
    entityId?: string,
  ) {
    await this.prisma.customerPortalActivity.create({
      data: { businessId, customerId, accountId, event, entityType, entityId },
    });
  }

  private settingsShape(
    settings: {
      enabled: boolean;
      enabledFeatures: Prisma.JsonValue;
      inviteExpiryHours: number;
      termsUrl: string | null;
      privacyUrl: string | null;
    } | null,
  ) {
    return {
      enabled: settings?.enabled ?? false,
      enabledFeatures: this.normalizeFeatures(
        settings?.enabledFeatures ?? [...CUSTOMER_PORTAL_FEATURES],
      ),
      inviteExpiryHours: settings?.inviteExpiryHours ?? 72,
      termsUrl: settings?.termsUrl ?? null,
      privacyUrl: settings?.privacyUrl ?? null,
    };
  }

  private portalQuotationStatus(order: {
    quotationStatus: QuotationStatus | null;
    quotationValidUntil: Date | null;
  }) {
    if (
      order.quotationStatus === QuotationStatus.sent &&
      order.quotationValidUntil &&
      order.quotationValidUntil.getTime() < Date.now()
    ) {
      return QuotationStatus.expired;
    }
    return order.quotationStatus;
  }

  private normalizeFeatures(value: Prisma.JsonValue | string[]): string[] {
    const input = Array.isArray(value) ? value : [];
    return input.filter(
      (feature): feature is CustomerPortalFeature =>
        typeof feature === 'string' &&
        (CUSTOMER_PORTAL_FEATURES as readonly string[]).includes(feature),
    );
  }

  private normalizeCards(cards: string[]) {
    if (
      !Array.isArray(cards) ||
      cards.some(
        (card) =>
          !(CUSTOMER_PORTAL_HOME_CARDS as readonly string[]).includes(card),
      )
    ) {
      throw new AppException(
        'PORTAL_LAYOUT_INVALID',
        'The home layout contains an unsupported card.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return [...new Set(cards)];
  }

  private normalizeLayout(value: unknown) {
    const input =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const cards = this.normalizeCards(
      Array.isArray(input.cards)
        ? (input.cards as string[])
        : [...CUSTOMER_PORTAL_HOME_CARDS],
    ) as CustomerPortalCard[];
    const labels = Array.isArray(input.labels)
      ? input.labels.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const row = item as { card?: unknown; label?: unknown };
          if (
            typeof row.card !== 'string' ||
            !cards.includes(row.card as CustomerPortalCard) ||
            typeof row.label !== 'string' ||
            !row.label.trim()
          )
            return [];
          return [
            {
              card: row.card as CustomerPortalCard,
              label: row.label.trim().slice(0, 50),
            },
          ];
        })
      : [];
    const announcements = Array.isArray(input.announcements)
      ? input.announcements.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const row = item as {
            title?: unknown;
            body?: unknown;
            enabled?: unknown;
          };
          if (
            typeof row.title !== 'string' ||
            !row.title.trim() ||
            typeof row.body !== 'string' ||
            !row.body.trim()
          )
            return [];
          return [
            {
              title: row.title.trim().slice(0, 100),
              body: row.body.trim().slice(0, 500),
              enabled: row.enabled === true,
            },
          ];
        })
      : [];
    const quickActions = Array.isArray(input.quickActions)
      ? input.quickActions.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const row = item as { label?: unknown; destination?: unknown };
          if (
            typeof row.label !== 'string' ||
            !row.label.trim() ||
            typeof row.destination !== 'string' ||
            !(CUSTOMER_PORTAL_HOME_CARDS as readonly string[]).includes(
              row.destination,
            )
          )
            return [];
          return [
            {
              label: row.label.trim().slice(0, 50),
              destination: row.destination as CustomerPortalCard,
            },
          ];
        })
      : [];
    const visibilityRules = Array.isArray(input.visibilityRules)
      ? input.visibilityRules.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const row = item as { card?: unknown; customerTags?: unknown };
          if (
            typeof row.card !== 'string' ||
            !cards.includes(row.card as CustomerPortalCard) ||
            !Array.isArray(row.customerTags)
          )
            return [];
          const customerTags = [
            ...new Set(
              row.customerTags
                .filter((tag): tag is string => typeof tag === 'string')
                .map((tag) => tag.trim().toLocaleLowerCase())
                .filter(Boolean),
            ),
          ].slice(0, 10);
          return customerTags.length
            ? [{ card: row.card as CustomerPortalCard, customerTags }]
            : [];
        })
      : [];
    return { cards, labels, announcements, quickActions, visibilityRules };
  }

  private normalizeCustomerTags(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim().toLocaleLowerCase())
          .filter(Boolean),
      ),
    ];
  }

  private safeBrandColor(value: string | null | undefined): string | null {
    return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
  }

  private safeExternalUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password)
        return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  private isVisibleForCustomer(
    card: CustomerPortalCard,
    rules: { card: CustomerPortalCard; customerTags: string[] }[],
    customerTags: string[],
  ) {
    const rule = rules.find((item) => item.card === card);
    return !rule || rule.customerTags.some((tag) => customerTags.includes(tag));
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private portalPageLimit(requested?: number) {
    if (!Number.isInteger(requested)) return PORTAL_PAGE_DEFAULT_LIMIT;
    return Math.max(1, Math.min(PORTAL_PAGE_MAX_LIMIT, requested!));
  }

  private cursorPage<T extends { id: string }>(
    rows: T[],
    limit: number,
  ): CustomerPortalCursorPage<T> {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      hasMore,
    };
  }

  private pageInfo<T>(page: CustomerPortalCursorPage<T>) {
    return { nextCursor: page.nextCursor, hasMore: page.hasMore };
  }

  private readBearer(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{32,})$/i);
    return match?.[1] ?? null;
  }

  private invalidCredentials() {
    return new AppException(
      'PORTAL_INVALID_CREDENTIALS',
      'Email or password is incorrect.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private invalidSession() {
    return new AppException(
      'PORTAL_SESSION_INVALID',
      'Your portal session is expired or invalid. Please sign in again.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private portalUnavailable() {
    return new AppException(
      'PORTAL_UNAVAILABLE',
      'This customer portal is not available.',
      HttpStatus.NOT_FOUND,
    );
  }

  private notFound(message: string) {
    return new AppException('PORTAL_NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
}
