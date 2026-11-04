import { HttpStatus, Injectable } from '@nestjs/common';
import { CustomerChannelConsentState, MessageChannel } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { parseDisabled } from '../business-modules/business-modules.service';
import { RecordCustomerChannelConsentDto } from './dto/customer-channel-consent.dto';

const CHANNELS = [
  MessageChannel.email,
  MessageChannel.sms,
  MessageChannel.whatsapp,
];
const INVALID_REFERENCE = 'CUSTOMER_CHANNEL_CONSENT_REFERENCE_INVALID';

function fail(code: string, message: string, status = HttpStatus.CONFLICT) {
  return new AppException(code, message, status);
}

type LockedCustomer = {
  id: string;
  phone: string;
  status: string;
  consentMarketing: number | boolean;
  optedOut: number | boolean;
};

@Injectable()
export class CustomerChannelConsentService {
  constructor(private readonly tenant: TenantPrismaService) {}

  private async assertCustomersEnabled(businessId: string) {
    const business = await this.tenant.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
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
    if (disabled.includes('customers')) {
      throw fail(
        'BUSINESS_MODULE_DISABLED',
        'Customers is disabled for this business.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async list(businessId: string, customerId: string) {
    await this.assertCustomersEnabled(businessId);
    const customer = await this.tenant.client.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true, phone: true },
    });
    if (!customer || customer.phone === `erased-${customer.id}`) {
      throw fail(
        'CUSTOMER_NOT_FOUND',
        'Customer not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const history = await this.tenant.client.customerChannelConsent.findMany({
      where: { businessId, customerId },
      orderBy: [{ channel: 'asc' }, { revision: 'desc' }],
      take: 60,
      select: {
        id: true,
        channel: true,
        state: true,
        source: true,
        evidenceReference: true,
        revision: true,
        createdAt: true,
      },
    });
    const latest = new Map<MessageChannel, (typeof history)[number]>();
    for (const record of history) {
      if (!latest.has(record.channel)) latest.set(record.channel, record);
    }

    return {
      channels: CHANNELS.map((channel) => ({
        channel,
        state: latest.get(channel)?.state ?? 'unknown',
        evidenceReference: latest.get(channel)?.evidenceReference ?? null,
        source: latest.get(channel)?.source ?? null,
        updatedAt: latest.get(channel)?.createdAt ?? null,
      })),
      history: history.slice(0, 20),
    };
  }

  async record(
    businessId: string,
    actorUserId: string,
    customerId: string,
    input: RecordCustomerChannelConsentDto,
  ) {
    await this.assertCustomersEnabled(businessId);
    const evidenceReference = input.evidenceReference.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,99}$/.test(evidenceReference)) {
      throw fail(
        INVALID_REFERENCE,
        'Use an internal evidence ID only (letters, digits, . _ : / # or -). Do not enter customer contact details or evidence text.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenant.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedCustomer[]>`
        SELECT id, phone, status,
          consent_marketing AS consentMarketing,
          opted_out AS optedOut
        FROM customers
        WHERE id = ${customerId} AND business_id = ${businessId}
        FOR UPDATE
      `;
      const customer = rows[0];
      if (!customer || customer.phone === `erased-${customer.id}`) {
        throw fail(
          'CUSTOMER_NOT_FOUND',
          'Customer not found.',
          HttpStatus.NOT_FOUND,
        );
      }
      if (
        input.state === CustomerChannelConsentState.granted &&
        (customer.status !== 'active' || Boolean(customer.optedOut))
      ) {
        throw fail(
          'CUSTOMER_CHANNEL_CONSENT_FORBIDDEN',
          'A channel grant cannot override an inactive profile or customer opt-out.',
          HttpStatus.FORBIDDEN,
        );
      }

      const previous = await tx.customerChannelConsent.findFirst({
        where: {
          businessId,
          customerId,
          channel: input.channel,
        },
        orderBy: { revision: 'desc' },
        select: { revision: true, state: true },
      });
      const revision = Number(previous?.revision ?? 0) + 1;
      const record = await tx.customerChannelConsent.create({
        data: {
          businessId,
          customerId,
          channel: input.channel,
          state: input.state,
          source: input.source,
          evidenceReference,
          revision,
          recordedByUserId: actorUserId,
        },
        select: {
          id: true,
          channel: true,
          state: true,
          source: true,
          evidenceReference: true,
          revision: true,
          createdAt: true,
        },
      });
      const latestByChannel = await tx.customerChannelConsent.findMany({
        where: { businessId, customerId },
        orderBy: [{ channel: 'asc' }, { revision: 'desc' }],
        select: { channel: true, state: true },
      });
      const seenChannels = new Set<MessageChannel>();
      let hasAnyCurrentGrant = false;
      for (const consent of latestByChannel) {
        if (seenChannels.has(consent.channel)) continue;
        seenChannels.add(consent.channel);
        if (consent.state === CustomerChannelConsentState.granted) {
          hasAnyCurrentGrant = true;
        }
      }
      await tx.customer.update({
        where: { id: customerId, businessId },
        data: { consentMarketing: hasAnyCurrentGrant },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'customers.channel_consent_recorded',
          entity: 'CustomerChannelConsent',
          entityId: record.id,
          before: {
            state: previous?.state ?? null,
            revision: previous?.revision ?? null,
            marketingConsentEnabled: Boolean(customer.consentMarketing),
          },
          after: {
            customerId,
            channel: record.channel,
            state: record.state,
            source: record.source,
            evidenceReference: record.evidenceReference,
            revision: record.revision,
            marketingConsentEnabled: hasAnyCurrentGrant,
          },
        },
      });
      return record;
    });
  }
}
