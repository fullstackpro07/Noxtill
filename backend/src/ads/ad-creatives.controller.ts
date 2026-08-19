import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AdCreativesService } from './ad-creatives.service';
import { CreateAdCreativeDto } from './dto/create-ad-creative.dto';
import { CreateCreativeFromReviewDto } from './dto/create-creative-from-review.dto';
import { UpdateAdCreativeDto } from './dto/update-ad-creative.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('ads/creatives')
export class AdCreativesController {
  constructor(private readonly creatives: AdCreativesService) {}

  @Get()
  list() {
    return this.creatives.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.creatives.findOne(id);
  }

  @RequireCapability(CAPABILITIES.ADS_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAdCreativeDto,
  ) {
    return this.creatives.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.ADS_MANAGE)
  @Post('from-review')
  createFromReview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCreativeFromReviewDto,
  ) {
    return this.creatives.createFromReview(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.ADS_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdCreativeDto) {
    return this.creatives.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.ADS_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.creatives.remove(id);
  }
}
