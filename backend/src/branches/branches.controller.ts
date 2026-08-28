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
import { RollupService } from './rollup.service';
import { BranchAdvisorService } from './branch-advisor.service';
import { BranchManagementService } from './branch-management.service';
import { BranchAdvisorDto } from './dto/branch-advisor.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CopyBranchSettingsDto } from './dto/copy-branch-settings.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller()
export class BranchesController {
  constructor(
    private readonly rollupService: RollupService,
    private readonly branchAdvisorService: BranchAdvisorService,
    private readonly branchManagementService: BranchManagementService,
  ) {}

  @RequireCapability(CAPABILITIES.BRANCHES_MANAGE)
  @Post('branches')
  createBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branchManagementService.create(user.businessId, dto);
  }

  @Get('branches')
  listBranches(@CurrentUser() user: AuthenticatedUser) {
    return this.branchManagementService.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BRANCHES_MANAGE)
  @Patch('branches/:id')
  updateBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchManagementService.update(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.BRANCHES_MANAGE)
  @Delete('branches/:id')
  deactivateBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.branchManagementService.deactivate(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.BRANCHES_MANAGE)
  @Post('branches/:id/reactivate')
  reactivateBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.branchManagementService.reactivate(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.BRANCHES_MANAGE)
  @Post('branches/:id/copy-settings')
  copyBranchSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CopyBranchSettingsDto,
  ) {
    return this.branchManagementService.copySettings(
      user.businessId,
      id,
      dto.fromBranchId,
    );
  }

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
