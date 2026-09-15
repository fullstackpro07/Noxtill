import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { UpdateBusinessGoalDto } from './dto/update-business-goal.dto';

export interface BusinessGoalDto {
  dailyRevenueTarget: number;
  dailyOrdersTarget: number | null;
  isSet: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Today's Goals fix-it: a real, persisted daily target (NeedsAttentionCard's "isn't available
 * yet" placeholder before this ticket) — one standing target per business, not per-date, matching
 * how the design's "Today's Goals" reads (a goal you set once and track every day, not a fresh
 * number each morning). `isSet` distinguishes "never configured" (0 by DB default) from a real
 * intentional 0 target. */
@Injectable()
export class BusinessGoalService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
  ) {}

  async getGoal(): Promise<BusinessGoalDto> {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const goal = await this.tenantPrisma.client.businessGoal.findUnique({
      where: { businessId },
    });
    if (!goal) {
      return { dailyRevenueTarget: 0, dailyOrdersTarget: null, isSet: false };
    }
    return {
      dailyRevenueTarget: round2(Number(goal.dailyRevenueTarget)),
      dailyOrdersTarget: goal.dailyOrdersTarget,
      isSet: true,
    };
  }

  async updateGoal(dto: UpdateBusinessGoalDto): Promise<BusinessGoalDto> {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const goal = await this.tenantPrisma.client.businessGoal.upsert({
      where: { businessId },
      create: {
        businessId,
        dailyRevenueTarget: dto.dailyRevenueTarget,
        dailyOrdersTarget: dto.dailyOrdersTarget ?? null,
      },
      update: {
        dailyRevenueTarget: dto.dailyRevenueTarget,
        dailyOrdersTarget: dto.dailyOrdersTarget ?? null,
      },
    });
    return {
      dailyRevenueTarget: round2(Number(goal.dailyRevenueTarget)),
      dailyOrdersTarget: goal.dailyOrdersTarget,
      isSet: true,
    };
  }
}
