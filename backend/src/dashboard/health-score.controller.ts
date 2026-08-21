import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { HealthScoreService } from './health-score.service';
import { UpdateHealthScoreWeightsDto } from './dto/update-health-score-weights.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('health-score')
export class HealthScoreController {
  constructor(private readonly healthScoreService: HealthScoreService) {}

  @Get()
  getScore(
    @CurrentUser() user: AuthenticatedUser,
    @Query('range') range?: string,
  ) {
    return this.healthScoreService.getScore(user.businessId, range);
  }

  /** UPD-BE-001e: Owner only — tightened from the original ticket's unrestricted access. */
  @RequireCapability(CAPABILITIES.HEALTH_SCORE_MANAGE)
  @Patch('weights')
  updateWeights(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateHealthScoreWeightsDto,
  ) {
    return this.healthScoreService.updateWeights(
      user.businessId,
      dto,
      user.sub,
    );
  }
}
