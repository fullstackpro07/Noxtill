import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AdAudiencesService } from './ad-audiences.service';
import { SyncAdAudienceDto } from './dto/sync-ad-audience.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('ads/audiences')
export class AdAudiencesController {
  constructor(private readonly audiences: AdAudiencesService) {}

  @Get()
  list() {
    return this.audiences.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.audiences.findOne(id);
  }

  @RequireCapability(CAPABILITIES.ADS_MANAGE)
  @Post('sync')
  syncFromSegment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncAdAudienceDto,
  ) {
    return this.audiences.syncFromSegment(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.ADS_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.audiences.remove(id);
  }
}
