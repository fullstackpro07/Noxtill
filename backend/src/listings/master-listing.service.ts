import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateMasterListingDto } from './dto/update-master-listing.dto';
import { MasterListingData } from '../integrations/connector.interface';

/**
 * Master Business Record (UPD-BE-041) — the single canonical NAP record `POST /listings/sync`
 * pushes to every connected directory. Created on first `PATCH`; `GET` before that returns a
 * default empty view (never a 404) so the frontend always has a shape to render.
 */
@Injectable()
export class MasterListingService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing = await this.tenantPrisma.client.masterListing.findUnique({
      where: { businessId },
    });
    return existing ?? this.emptyView(businessId);
  }

  async update(businessId: string, dto: UpdateMasterListingDto) {
    return this.tenantPrisma.client.masterListing.upsert({
      where: { businessId },
      create: { businessId, ...dto },
      update: { ...dto },
    });
  }

  /** Throws nothing — callers (e.g. sync) that require a real record check for `null` themselves. */
  async find(businessId: string) {
    return this.tenantPrisma.client.masterListing.findUnique({
      where: { businessId },
    });
  }

  toConnectorData(listing: {
    name: string;
    phone: string | null;
    website: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    categories: unknown;
    description: string | null;
    hours: unknown;
  }): MasterListingData {
    return {
      name: listing.name,
      phone: listing.phone,
      website: listing.website,
      addressLine1: listing.addressLine1,
      addressLine2: listing.addressLine2,
      city: listing.city,
      state: listing.state,
      postalCode: listing.postalCode,
      country: listing.country,
      categories: listing.categories,
      description: listing.description,
      hours: listing.hours,
    };
  }

  private emptyView(businessId: string) {
    return {
      id: null,
      businessId,
      name: '',
      phone: null,
      website: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      categories: [] as string[],
      description: null,
      hours: {} as Record<string, unknown>,
      logoUrl: null,
      createdAt: null,
      updatedAt: null,
    };
  }
}
