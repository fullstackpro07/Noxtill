import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RollupService } from './rollup.service';
import { BranchAdvisorService } from './branch-advisor.service';
import { BranchAdvisorDto } from './dto/branch-advisor.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller()
export class BranchesController {
  constructor(
    private readonly rollupService: RollupService,
    private readonly branchAdvisorService: BranchAdvisorService,
  ) {}

  @Get('rollup/dashboard')
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: string,
  ) {
    return this.rollupService.dashboard(
      user.businessId,
      days ? Number(days) : undefined,
    );
  }

  @Get('rollup/compare')
  compare(
    @CurrentUser() user: AuthenticatedUser,
    @Query('weeks') weeks?: string,
  ) {
    return this.rollupService.compare(
      user.businessId,
      weeks ? Number(weeks) : undefined,
    );
  }

  @Post('ai/branch-advisor')
  branchAdvisor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BranchAdvisorDto,
  ) {
    return this.branchAdvisorService.ask(user.businessId, dto);
  }
}
