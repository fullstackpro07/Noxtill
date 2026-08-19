import { Controller, Get, Query } from '@nestjs/common';
import { VisibilityScoreService } from './visibility-score.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('visibility-score')
export class VisibilityScoreController {
  constructor(private readonly visibilityScore: VisibilityScoreService) {}

  @Get()
  getScore(
    @CurrentUser() user: AuthenticatedUser,
    @Query('range') range?: string,
  ) {
    return this.visibilityScore.getScore(user.businessId, range);
  }
}
