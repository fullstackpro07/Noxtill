import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateAdCreativeDto } from './dto/create-ad-creative.dto';
import { CreateCreativeFromReviewDto } from './dto/create-creative-from-review.dto';
import { UpdateAdCreativeDto } from './dto/update-ad-creative.dto';

/**
 * Ad Creatives (UPD-BE-070). `createFromReview` is the "review-to-ad" flow the ticket calls
 * out — real customer review text becomes real ad copy, reusing the creative-render capability
 * already proven for Meta Ads (v1 INT-013): a headline drawn from the star rating, body from the
 * review's own words, never AI-invented praise.
 */
@Injectable()
export class AdCreativesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list() {
    return this.tenantPrisma.client.adCreative.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const creative = await this.tenantPrisma.client.adCreative.findUnique({
      where: { id },
    });
    if (!creative) throw new NotFoundException('Ad creative not found');
    return creative;
  }

  create(businessId: string, dto: CreateAdCreativeDto) {
    return this.tenantPrisma.client.adCreative.create({
      data: {
        businessId,
        provider: dto.provider,
        campaignId: dto.campaignId,
        headline: dto.headline,
        body: dto.body,
        mediaKey: dto.mediaKey,
      },
    });
  }

  async createFromReview(businessId: string, dto: CreateCreativeFromReviewDto) {
    const review = await this.tenantPrisma.client.externalReview.findUnique({
      where: { id: dto.reviewId },
    });
    if (!review) throw new NotFoundException('Source review not found');

    const stars = '★'.repeat(review.stars) + '☆'.repeat(5 - review.stars);
    return this.tenantPrisma.client.adCreative.create({
      data: {
        businessId,
        provider: dto.provider,
        campaignId: dto.campaignId,
        headline: `${stars} from a real customer`,
        body: review.text ?? `Rated ${review.stars}/5 on ${review.platform}.`,
        sourceReviewId: review.id,
      },
    });
  }

  async update(id: string, dto: UpdateAdCreativeDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.adCreative.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.adCreative.delete({ where: { id } });
    return { success: true };
  }
}
