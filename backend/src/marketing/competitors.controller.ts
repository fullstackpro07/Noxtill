import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { UpdateCompetitorDto } from './dto/update-competitor.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('competitors')
export class CompetitorsController {
  constructor(private readonly competitorsService: CompetitorsService) {}

  /** Registered before `:id/*` — "search" is a static path segment, never matched as an id. */
  @Get('search')
  search(@Query('query') query: string) {
    return this.competitorsService.search(query);
  }

  @Get()
  list() {
    return this.competitorsService.list();
  }

  @Get('category-average')
  categoryAverage() {
    return this.competitorsService.categoryAverage();
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompetitorDto,
  ) {
    return this.competitorsService.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompetitorDto) {
    return this.competitorsService.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.competitorsService.remove(id);
  }

  @Get(':id/ads')
  ads(@Param('id') id: string) {
    return this.competitorsService.ads(id);
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.competitorsService.history(id);
  }

  /** Competitor detail depth fix — real hours/reviews/photos, fetched fresh on demand. */
  @Get(':id/details')
  details(@Param('id') id: string) {
    return this.competitorsService.details(id);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post(':id/snapshot')
  triggerSnapshot(@Param('id') id: string) {
    return this.competitorsService.triggerSnapshot(id);
  }
}
