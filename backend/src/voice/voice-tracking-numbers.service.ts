import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddVoiceTrackingNumberDto,
  AssignVoiceTrackingNumberDto,
  DeactivateVoiceTrackingNumberDto,
} from './dto/voice-tracking.dto';
import { VOICE_ERROR_CODES } from './voice.constants';

/** Marker stored in `PhoneCall.attributionReason` for calls attributed by the dialed number. */
export const TRACKING_NUMBER_ATTRIBUTION_REASON =
  'Automatic: inbound call to an assigned tracking number.';

const maskNumber = (phone: string) => `•••• ${phone.slice(-4)}`;

interface TwilioIncomingNumber {
  sid: string;
  phone_number: string;
}

/**
 * Inbound-call routing hook (no request tenant): resolves a dialed tracking number to its business
 * and, while the number is active, the source it is assigned to at this moment. Prior calls keep the
 * attribution stamped when they arrived, so reassigning a number never rewrites history.
 */
export async function resolveTrackingLine(
  prisma: Pick<Prisma.TransactionClient, 'voiceTrackingNumber'>,
  toNumber: string,
) {
  const number = await prisma.voiceTrackingNumber.findUnique({
    where: { phoneNumber: toNumber },
  });
  if (!number) return null;
  return {
    businessId: number.businessId,
    callData: {
      trackingNumberId: number.id,
      ...(number.active
        ? {
            attributionSource: number.source,
            attributionChannel: number.channel,
            attributionCampaignId: number.campaignId,
            attributionEvidence: `Caller dialed tracking number ${maskNumber(number.phoneNumber)} (${number.label}).`,
            attributionReason: TRACKING_NUMBER_ATTRIBUTION_REASON,
            attributionUpdatedAt: new Date(),
          }
        : {}),
    } satisfies Partial<Prisma.PhoneCallUncheckedCreateInput>,
  };
}

/**
 * Tracking & Attribution — campaign tracking numbers. A number is either bought from, or verified
 * to already exist in, the connected Twilio account (ownership check), then pointed at the normal
 * inbound webhook. Assignments are time-windowed history rows.
 */
@Injectable()
export class VoiceTrackingNumbersService {
  private readonly logger = new Logger(VoiceTrackingNumbersService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async list(businessId: string) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const numbers = await this.tenantPrisma.client.voiceTrackingNumber.findMany(
      {
        where: { businessId },
        include: {
          campaign: { select: { id: true, provider: true, goal: true } },
          assignments: {
            orderBy: [{ validFrom: 'desc' }, { id: 'asc' }],
            take: 10,
          },
        },
        orderBy: [{ active: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      },
    );
    const ids = numbers.map((number) => number.id);
    const [counts, lastCalls] = await Promise.all([
      this.tenantPrisma.client.phoneCall.groupBy({
        by: ['trackingNumberId'],
        where: {
          businessId,
          trackingNumberId: { in: ids },
          startedAt: { gte: since },
        },
        _count: { _all: true },
      }),
      this.tenantPrisma.client.phoneCall.groupBy({
        by: ['trackingNumberId'],
        where: { businessId, trackingNumberId: { in: ids } },
        _max: { startedAt: true },
      }),
    ]);
    const countBy = new Map(
      counts.map((row) => [row.trackingNumberId, row._count._all]),
    );
    const lastBy = new Map(
      lastCalls.map((row) => [row.trackingNumberId, row._max.startedAt]),
    );
    return numbers.map((number) => ({
      id: number.id,
      phoneNumber: number.phoneNumber,
      label: number.label,
      provider: 'Twilio',
      provisionedVia: number.provisionedVia,
      source: number.source,
      channel: number.channel,
      campaign: number.campaign
        ? {
            id: number.campaign.id,
            label: `${number.campaign.provider} · ${number.campaign.goal}`,
          }
        : null,
      active: number.active,
      deactivatedAt: number.deactivatedAt?.toISOString() ?? null,
      callsLast30Days: countBy.get(number.id) ?? 0,
      lastCallAt: lastBy.get(number.id)?.toISOString() ?? null,
      assignments: number.assignments.map((row) => ({
        id: row.id,
        source: row.source,
        channel: row.channel,
        campaignId: row.campaignId,
        validFrom: row.validFrom.toISOString(),
        validTo: row.validTo?.toISOString() ?? null,
        reason: row.reason,
      })),
    }));
  }

  /** Buys a new local number, or verifies an existing one is in the connected Twilio account. */
  async add(
    businessId: string,
    actorUserId: string,
    dto: AddVoiceTrackingNumberDto,
  ) {
    const source = this.text(dto.source, 'Source');
    const channel = this.text(dto.channel, 'Channel');
    const label = this.text(dto.label, 'Label');
    await this.assertCampaign(businessId, dto.campaignId ?? null);
    const { accountSid, auth } = this.twilio();
    const backendUrl = this.config.get<string>('BACKEND_URL') ?? '';
    const webhook = {
      VoiceUrl: `${backendUrl}/voice/webhook/incoming`,
      VoiceMethod: 'POST',
      StatusCallback: `${backendUrl}/voice/webhook/status`,
      StatusCallbackMethod: 'POST',
    };
    const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

    let provider: TwilioIncomingNumber;
    if (dto.mode === 'connect') {
      const parsed = parsePhoneNumberFromString(dto.phoneNumber ?? '');
      if (!parsed?.isValid())
        throw this.invalid(
          'Enter the number in international format, e.g. +14155550100.',
        );
      await this.assertUnclaimed(parsed.number);
      const owned = await this.providerCall(() =>
        axios.get<{ incoming_phone_numbers: TwilioIncomingNumber[] }>(
          `${base}/IncomingPhoneNumbers.json`,
          { auth, params: { PhoneNumber: parsed.number } },
        ),
      );
      const match = owned.data.incoming_phone_numbers[0];
      if (!match) {
        throw new AppException(
          VOICE_ERROR_CODES.TRACKING_NUMBER_NOT_OWNED,
          'That number is not in the connected Twilio account, so ownership cannot be verified.',
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.providerCall(() =>
        axios.post(
          `${base}/IncomingPhoneNumbers/${match.sid}.json`,
          new URLSearchParams(webhook),
          { auth },
        ),
      );
      provider = match;
    } else {
      const country = (dto.countryCode ?? 'US').toUpperCase();
      const available = await this.providerCall(() =>
        axios.get<{ available_phone_numbers: { phone_number: string }[] }>(
          `${base}/AvailablePhoneNumbers/${country}/Local.json`,
          {
            auth,
            params: {
              VoiceEnabled: true,
              Limit: 1,
              ...(dto.areaCode ? { AreaCode: dto.areaCode } : {}),
            },
          },
        ),
      );
      const candidate = available.data.available_phone_numbers[0];
      if (!candidate) {
        throw new AppException(
          VOICE_ERROR_CODES.NO_NUMBERS_AVAILABLE,
          'The provider has no matching local number available right now.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      await this.assertUnclaimed(candidate.phone_number);
      const purchased = await this.providerCall(() =>
        axios.post<TwilioIncomingNumber>(
          `${base}/IncomingPhoneNumbers.json`,
          new URLSearchParams({
            PhoneNumber: candidate.phone_number,
            ...webhook,
          }),
          { auth },
        ),
      );
      provider = purchased.data;
    }

    const now = new Date();
    const number = await this.tenantPrisma.client.voiceTrackingNumber.create({
      data: {
        businessId,
        phoneNumber: provider.phone_number,
        twilioSid: provider.sid,
        label,
        source,
        channel,
        campaignId: dto.campaignId ?? null,
        provisionedVia: dto.mode === 'connect' ? 'connected' : 'purchased',
        createdByUserId: actorUserId,
        assignments: {
          create: {
            businessId,
            source,
            channel,
            campaignId: dto.campaignId ?? null,
            validFrom: now,
            reason: 'Initial assignment',
            createdByUserId: actorUserId,
          },
        },
      },
    });
    await this.audit.log({
      entity: 'VoiceTrackingNumber',
      entityId: number.id,
      action: 'voice.tracking.number_assigned',
      after: {
        phone: maskNumber(number.phoneNumber),
        source,
        channel,
        campaignId: number.campaignId,
        provisionedVia: number.provisionedVia,
      },
    });
    this.logger.log(
      `Tracking number ${number.phoneNumber} ${number.provisionedVia} for business ${businessId}`,
    );
    return {
      id: number.id,
      phoneNumber: number.phoneNumber,
      provisionedVia: number.provisionedVia,
    };
  }

  /** Reassigns the number; the previous assignment window is closed, never edited. */
  async assign(
    businessId: string,
    actorUserId: string,
    numberId: string,
    dto: AssignVoiceTrackingNumberDto,
  ) {
    const source = this.text(dto.source, 'Source');
    const channel = this.text(dto.channel, 'Channel');
    const reason = this.text(dto.reason, 'Reason');
    const number = await this.find(businessId, numberId);
    await this.assertCampaign(businessId, dto.campaignId ?? null);
    const now = new Date();
    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.voiceTrackingNumberAssignment.updateMany({
        where: { businessId, numberId, validTo: null },
        data: { validTo: now },
      }),
      this.tenantPrisma.client.voiceTrackingNumberAssignment.create({
        data: {
          businessId,
          numberId,
          source,
          channel,
          campaignId: dto.campaignId ?? null,
          validFrom: now,
          reason,
          createdByUserId: actorUserId,
        },
      }),
      this.tenantPrisma.client.voiceTrackingNumber.update({
        where: { id: numberId },
        data: {
          source,
          channel,
          campaignId: dto.campaignId ?? null,
          active: true,
          deactivatedAt: null,
        },
      }),
    ]);
    await this.audit.log({
      entity: 'VoiceTrackingNumber',
      entityId: numberId,
      action: 'voice.tracking.number_assigned',
      before: {
        source: number.source,
        channel: number.channel,
        campaignId: number.campaignId,
        active: number.active,
      },
      after: { source, channel, campaignId: dto.campaignId ?? null, reason },
    });
    return {
      id: numberId,
      source,
      channel,
      campaignId: dto.campaignId ?? null,
    };
  }

  /** Stops attributing calls. The number keeps routing to this business; it is not released at Twilio. */
  async deactivate(
    businessId: string,
    actorUserId: string,
    numberId: string,
    dto: DeactivateVoiceTrackingNumberDto,
  ) {
    const reason = this.text(dto.reason, 'Reason');
    const number = await this.find(businessId, numberId);
    if (!number.active)
      throw this.invalid('This tracking number is already inactive.');
    const now = new Date();
    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.voiceTrackingNumberAssignment.updateMany({
        where: { businessId, numberId, validTo: null },
        data: { validTo: now },
      }),
      this.tenantPrisma.client.voiceTrackingNumber.update({
        where: { id: numberId },
        data: { active: false, deactivatedAt: now },
      }),
    ]);
    await this.audit.log({
      entity: 'VoiceTrackingNumber',
      entityId: numberId,
      action: 'voice.tracking.number_released',
      after: { reason, actorUserId, providerReleased: false },
    });
    return { id: numberId, active: false };
  }

  /** Global (cross-tenant) uniqueness: one number can belong to only one line or tracking assignment. */
  private async assertUnclaimed(phoneNumber: string) {
    const [line, tracking] = await Promise.all([
      this.prisma.phoneNumber.findUnique({ where: { phoneNumber } }),
      this.prisma.voiceTrackingNumber.findUnique({ where: { phoneNumber } }),
    ]);
    if (line || tracking) {
      throw new AppException(
        VOICE_ERROR_CODES.TRACKING_NUMBER_IN_USE,
        'That number is already registered as a voice line or tracking number.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async assertCampaign(businessId: string, campaignId: string | null) {
    if (!campaignId) return;
    const campaign = await this.tenantPrisma.client.adCampaign.findFirst({
      where: { id: campaignId, businessId },
      select: { id: true },
    });
    if (!campaign) {
      throw new AppException(
        'VOICE_ATTRIBUTION_CAMPAIGN_NOT_FOUND',
        'Choose an advertising campaign that belongs to this business.',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async find(businessId: string, numberId: string) {
    const number = await this.tenantPrisma.client.voiceTrackingNumber.findFirst(
      {
        where: { id: numberId, businessId },
      },
    );
    if (!number) {
      throw new AppException(
        VOICE_ERROR_CODES.TRACKING_NUMBER_NOT_FOUND,
        'Tracking number was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return number;
  }

  private twilio() {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Voice calling is not configured on this server.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { accountSid, auth: { username: accountSid, password: authToken } };
  }

  private async providerCall<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'The phone provider rejected the request. No number was added.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private text(value: string, field: string) {
    const normalized = value?.trim() ?? '';
    if (normalized.length < 2)
      throw this.invalid(`${field} must contain at least 2 characters.`);
    return normalized;
  }

  private invalid(message: string) {
    return new AppException(
      VOICE_ERROR_CODES.TRACKING_NUMBER_INVALID,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
