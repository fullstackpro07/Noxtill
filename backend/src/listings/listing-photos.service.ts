import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import {
  CreateListingPhotoDto,
  UpdateListingPhotoDto,
} from './dto/listing-photo.dto';
import { LISTING_ERROR_CODES } from './listings.constants';
import { IntegrationStatus, Prisma } from '@prisma/client';

export interface PhotoPushResult {
  provider: string;
  status: 'success' | 'failed';
  message?: string;
}

/**
 * Photos & Media, cross-directory (UPD-BE-124) — a generic photo, distinct from the GMB-only
 * `GmbPhoto`/`listings/gmb/photos` (kept as-is). `push()` mirrors `ListingSyncService.sync()`'s
 * shape exactly: iterate connected providers, skip ones whose connector doesn't implement the
 * capability, log the real outcome per provider.
 */
@Injectable()
export class ListingPhotosService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
  ) {}

  list(businessId: string) {
    return this.tenantPrisma.client.listingPhoto.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(businessId: string, dto: CreateListingPhotoDto) {
    return this.tenantPrisma.client.listingPhoto.create({
      data: { businessId, url: dto.url, category: dto.category },
    });
  }

  async update(businessId: string, id: string, dto: UpdateListingPhotoDto) {
    await this.assertOwned(businessId, id);
    return this.tenantPrisma.client.listingPhoto.update({
      where: { id },
      data: { category: dto.category },
    });
  }

  async remove(businessId: string, id: string) {
    await this.assertOwned(businessId, id);
    await this.tenantPrisma.client.listingPhoto.delete({ where: { id } });
  }

  /**
   * Pushes the photo to `providers` (or every connected directory that supports photo push, when
   * omitted). A provider whose connector doesn't implement `pushPhoto` is silently skipped, not
   * reported as failed — it was never claimed to be pushable. All four directory connectors
   * implement it today, so this only matters for a future connector that genuinely can't.
   */
  async push(
    businessId: string,
    id: string,
    providers?: string[],
  ): Promise<PhotoPushResult[]> {
    const photo = await this.assertOwned(businessId, id);
    const pushable = this.connectors.photoPushProviders();
    const candidates = providers
      ? pushable.filter((p) => providers.includes(p))
      : pushable;

    const results: PhotoPushResult[] = [];
    const pushedProviders = new Set(
      (photo.pushedProviders as string[] | null) ?? [],
    );

    for (const provider of candidates) {
      const integration = await this.tenantPrisma.client.integration.findUnique(
        { where: { businessId_provider: { businessId, provider } } },
      );
      if (!integration || integration.status !== IntegrationStatus.connected) {
        continue;
      }

      const tokens = await this.integrations.getTokens(businessId, provider);
      const connector = this.connectors.get(provider);
      if (!tokens || !connector.pushPhoto) continue;

      try {
        await connector.pushPhoto(
          tokens,
          photo.url,
          photo.category,
          integration.meta as Record<string, unknown>,
        );
        pushedProviders.add(provider);
        results.push({ provider, status: 'success' });
      } catch (error) {
        results.push({
          provider,
          status: 'failed',
          message: (error as Error).message,
        });
      }
    }

    await this.tenantPrisma.client.listingPhoto.update({
      where: { id },
      data: {
        pushedProviders: [
          ...pushedProviders,
        ] as unknown as Prisma.InputJsonValue,
      },
    });

    return results;
  }

  private async assertOwned(businessId: string, id: string) {
    const photo = await this.tenantPrisma.client.listingPhoto.findUnique({
      where: { id },
    });
    if (!photo || photo.businessId !== businessId) {
      throw new AppException(
        LISTING_ERROR_CODES.LISTING_PHOTO_NOT_FOUND,
        `Listing photo ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    return photo;
  }
}
