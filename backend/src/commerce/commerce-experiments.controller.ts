import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  CreateCommerceExperimentDto,
  DecideCommerceExperimentDto,
} from './dto/commerce-experiment.dto';
import { CommerceExperimentsService } from './commerce-experiments.service';

@Controller('commerce/experiments')
export class CommerceExperimentsController {
  constructor(private readonly experiments: CommerceExperimentsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.experiments.summary(user.businessId);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.experiments.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceExperimentDto,
  ) {
    return this.experiments.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/start')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.experiments.start(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/stop')
  stop(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.experiments.stop(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/decision')
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideCommerceExperimentDto,
  ) {
    return this.experiments.decide(
      user.businessId,
      user.sub,
      id,
      dto.decision,
      dto.note,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.experiments.removeDraft(user.businessId, user.sub, id);
  }
}
