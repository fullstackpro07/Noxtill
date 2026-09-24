import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  PublicListingCompleteness,
  publicListingCompleteness,
} from '../marketing/public-listing-completeness';

/**
 * The business's own listing, scored on the SAME seven public checks a competitor's Google listing
 * is scored on (`publicListingCompleteness`) — so "you vs the market" compares like with like.
 * Returns null when no Master Record exists yet (nothing to score, never a fabricated 0%).
 */
@Injectable()
export class OwnListingCompletenessService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string): Promise<PublicListingCompleteness | null> {
    const listing = await this.tenantPrisma.client.masterListing.findUnique({
      where: { businessId },
    });
    if (!listing) return null;

    const photoCount = await this.tenantPrisma.client.listingPhoto.count({
      where: { businessId },
    });
    const filled = (v: string | null) => v != null && v.trim() !== '';
    const hours = listing.hours as Record<string, unknown> | null;

    return publicListingCompleteness({
      name: filled(listing.name),
      phone: filled(listing.phone),
      website: filled(listing.website),
      address: filled(listing.addressLine1),
      hours: !!hours && Object.keys(hours).length > 0,
      category:
        Array.isArray(listing.categories) && listing.categories.length > 0,
      photos: photoCount > 0,
    });
  }
}
