import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SegmentsService } from '../customers/segments.service';
import { AppException } from '../common/filters/app.exception';
import { SyncAdAudienceDto } from './dto/sync-ad-audience.dto';
import { AD_ERROR_CODES } from './ads.constants';

/**
 * Ad Audiences (UPD-BE-070) — `syncFromSegment` builds a real audience from an existing CRM
 * segment (`SegmentsService`, BE-041), always excluding opted-out customers first: a consent
 * check, not just a data filter, since these customers explicitly asked not to be contacted or
 * targeted. Stored locally; pushing the real hashed-match list to a specific ad platform's Custom
 * Audience API is provider-specific future work (disclosed scope boundary, same reasoning as
 * `DeliveryZone` not being wired into POS pricing yet).
 */
@Injectable()
export class AdAudiencesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly segments: SegmentsService,
  ) {}

  list() {
    return this.tenantPrisma.client.adAudience.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const audience = await this.tenantPrisma.client.adAudience.findUnique({
      where: { id },
    });
    if (!audience) throw new NotFoundException('Ad audience not found');
    return audience;
  }

  async syncFromSegment(businessId: string, dto: SyncAdAudienceDto) {
    const segment = await this.segments.getSegment(dto.segmentKey);
    if (segment.count === 0 && dto.segmentKey !== 'all') {
      throw new AppException(
        AD_ERROR_CODES.UNKNOWN_SEGMENT,
        `Segment "${dto.segmentKey}" has no members — check the key is correct`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const consented = segment.members.filter((m) => !m.optedOut);

    return this.tenantPrisma.client.adAudience.create({
      data: {
        businessId,
        provider: dto.provider,
        name: dto.name ?? `${dto.segmentKey} (synced)`,
        segmentKey: dto.segmentKey,
        size: consented.length,
        status: 'local',
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.adAudience.delete({ where: { id } });
    return { success: true };
  }
}
