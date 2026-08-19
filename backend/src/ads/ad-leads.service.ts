import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { IngestAdLeadDto } from './dto/ingest-ad-lead.dto';
import { IntegrationProvider, Prisma } from '@prisma/client';

/**
 * Lead Inbox (UPD-BE-071) — `ingest` is called from each provider's real lead-gen-form webhook
 * (Meta Lead Ads, LinkedIn Lead Gen Forms, etc.), idempotent by the model's own
 * `(provider, externalId)` unique constraint rather than a separate bookkeeping table — the write
 * itself is fast enough not to need the queued-webhook pattern used for heavier processing elsewhere.
 */
@Injectable()
export class AdLeadsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  list() {
    return this.tenantPrisma.client.adLead.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Runs outside any request context (a public webhook) — scopes explicitly via the raw client, same convention as every other webhook handler. */
  async ingest(
    businessId: string,
    provider: IntegrationProvider,
    dto: IngestAdLeadDto,
  ) {
    const campaign = dto.campaignExternalId
      ? await this.prisma.adCampaign.findFirst({
          where: { businessId, provider, externalId: dto.campaignExternalId },
        })
      : null;

    return this.prisma.adLead.upsert({
      where: {
        provider_externalId: { provider, externalId: dto.externalId },
      },
      create: {
        businessId,
        provider,
        externalId: dto.externalId,
        campaignId: campaign?.id,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        formData: (dto.formData ?? {}) as unknown as Prisma.InputJsonValue,
      },
      update: {}, // a re-delivered webhook (at-least-once delivery) is a no-op, not an error
    });
  }
}
