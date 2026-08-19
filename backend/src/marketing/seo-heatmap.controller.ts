import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SeoHeatmapService } from './seo-heatmap.service';
import { ScanSeoHeatmapDto } from './dto/scan-seo-heatmap.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('seo/heatmap')
export class SeoHeatmapController {
  constructor(private readonly seoHeatmap: SeoHeatmapService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('keyword') keyword: string,
  ) {
    return this.seoHeatmap.list(user.businessId, keyword);
  }

  @Post('scan')
  scan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScanSeoHeatmapDto) {
    return this.seoHeatmap.scan(
      user.businessId,
      dto.keyword,
      dto.radiusKm,
      dto.ringPoints,
    );
  }
}
