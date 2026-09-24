import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CompetitorObservationsService } from './competitor-observations.service';
import { CreateCompetitorObservationDto } from './dto/create-competitor-observation.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('competitor-observations')
export class CompetitorObservationsController {
  constructor(private readonly observations: CompetitorObservationsService) {}

  @Get()
  list(@Query('competitorId') competitorId?: string) {
    return this.observations.list(competitorId || undefined);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompetitorObservationDto,
  ) {
    return this.observations.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.observations.remove(id);
  }
}
