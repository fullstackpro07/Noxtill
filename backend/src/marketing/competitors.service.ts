import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { MARKETING_ERROR_CODES, MAX_COMPETITORS } from './marketing.constants';

/**
 * Competitor tracking (BE-063). The actual Google Place rating/review-count
 * lookup is stubbed pending the Google connector (BE-084, Module 18) — see
 * CompetitorSnapshotProcessor. Capped at 5 per business per spec.
 */
@Injectable()
export class CompetitorsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list() {
    return this.tenantPrisma.client.competitor.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(businessId: string, dto: CreateCompetitorDto) {
    const count = await this.tenantPrisma.client.competitor.count();
    if (count >= MAX_COMPETITORS) {
      throw new AppException(
        MARKETING_ERROR_CODES.COMPETITOR_LIMIT_REACHED,
        `You can track at most ${MAX_COMPETITORS} competitors`,
        HttpStatus.FORBIDDEN,
      );
    }

    return this.tenantPrisma.client.competitor.create({
      data: {
        businessId,
        platformRef: dto.platformRef,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.tenantPrisma.client.competitor.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Competitor not found');
    }
    await this.tenantPrisma.client.competitor.delete({ where: { id } });
    return { success: true };
  }
}
