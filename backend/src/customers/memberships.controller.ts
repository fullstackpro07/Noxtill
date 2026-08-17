import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post('membership-plans')
  createPlan(@Body() dto: CreateMembershipPlanDto) {
    return this.membershipsService.createPlan(dto);
  }

  @Get('membership-plans')
  listPlans() {
    return this.membershipsService.listPlans();
  }

  @Post('memberships')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMembershipDto,
  ) {
    return this.membershipsService.create(user.businessId, dto);
  }

  @Get('memberships')
  list(@Query('customerId') customerId?: string) {
    return this.membershipsService.listMemberships(customerId);
  }

  @Post('memberships/:id/activate')
  activate(@Param('id') id: string) {
    return this.membershipsService.activate(id);
  }

  @Post('memberships/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.membershipsService.cancel(id);
  }
}
