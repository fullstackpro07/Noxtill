import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AiInsightsService } from './ai-insights.service';
import { UpdateInsightStatusDto } from './dto/update-insight-status.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { AiInsightCategory } from '@prisma/client';

@Controller('ai/insights')
export class AiInsightsController {
  constructor(private readonly aiInsightsService: AiInsightsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('category') category?: AiInsightCategory,
    @Query('status') status?: string,
  ) {
    return this.aiInsightsService.list(user.businessId, category, status);
  }

  @Post(':id/action')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateInsightStatusDto,
  ) {
    return this.aiInsightsService.setStatus(user.businessId, id, dto.status);
  }
}
