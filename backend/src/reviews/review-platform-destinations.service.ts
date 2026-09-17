import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateReviewPlatformDestinationDto } from './dto/create-review-platform-destination.dto';

/**
 * Additional real public-review destinations (UPD-BE-M31) beyond the single primary
 * `Business.publicReviewUrl`/`publicReviewPlatform` pair — lets a business list, say, both Google
 * and Facebook and have the public rating page offer a real choice between them (see
 * `PublicReviewService.submit()`), rather than only ever having one possible destination.
 */
@Injectable()
export class ReviewPlatformDestinationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(businessId: string) {
    return this.tenantPrisma.client.reviewPlatformDestination.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });
  }

  upsert(businessId: string, dto: CreateReviewPlatformDestinationDto) {
    const platform = dto.platform.trim().toLowerCase();
    return this.tenantPrisma.client.reviewPlatformDestination.upsert({
      where: { businessId_platform: { businessId, platform } },
      create: { businessId, platform, url: dto.url },
      update: { url: dto.url },
    });
  }

  async remove(businessId: string, platform: string): Promise<void> {
    const key = platform.trim().toLowerCase();
    const existing =
      await this.tenantPrisma.client.reviewPlatformDestination.findUnique({
        where: { businessId_platform: { businessId, platform: key } },
      });
    if (!existing) {
      throw new NotFoundException('Platform destination not found');
    }
    await this.tenantPrisma.client.reviewPlatformDestination.delete({
      where: { businessId_platform: { businessId, platform: key } },
    });
  }
}
