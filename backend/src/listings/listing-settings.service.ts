import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateListingSettingsDto } from './dto/listing-settings.dto';
import { Prisma } from '@prisma/client';

/**
 * Listings Settings (UPD-BE-125). `get()` never 404s — a business without a row yet gets the real
 * defaults (auto-sync off, no field exclusions, master-wins), same "always a shape to render"
 * convention as `MasterListingService.get()`.
 */
@Injectable()
export class ListingSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing = await this.tenantPrisma.client.listingSettings.findUnique({
      where: { businessId },
    });
    return existing ?? this.defaults(businessId);
  }

  /** Real, non-throwing default lookup for internal callers (e.g. `ListingSyncService`) that don't need the "always a row" HTTP-view shape. */
  async findFieldMapping(
    businessId: string,
  ): Promise<Record<string, string[]>> {
    const settings = await this.tenantPrisma.client.listingSettings.findUnique({
      where: { businessId },
    });
    return (settings?.fieldMapping as Record<string, string[]> | null) ?? {};
  }

  async update(businessId: string, dto: UpdateListingSettingsDto) {
    return this.tenantPrisma.client.listingSettings.upsert({
      where: { businessId },
      create: {
        businessId,
        autoSyncEnabled: dto.autoSyncEnabled ?? false,
        autoSyncFrequencyHours: dto.autoSyncFrequencyHours ?? 24,
        fieldMapping: (dto.fieldMapping ?? {}) as Prisma.InputJsonValue,
        conflictResolution: dto.conflictResolution ?? 'master_wins',
      },
      update: {
        autoSyncEnabled: dto.autoSyncEnabled,
        autoSyncFrequencyHours: dto.autoSyncFrequencyHours,
        fieldMapping: dto.fieldMapping as Prisma.InputJsonValue | undefined,
        conflictResolution: dto.conflictResolution,
      },
    });
  }

  private defaults(businessId: string) {
    return {
      id: null,
      businessId,
      autoSyncEnabled: false,
      autoSyncFrequencyHours: 24,
      fieldMapping: {} as Record<string, string[]>,
      conflictResolution: 'master_wins' as const,
      lastAutoSyncAt: null,
      createdAt: null,
      updatedAt: null,
    };
  }
}
