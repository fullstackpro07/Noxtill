import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { ProcurementAnalyticsService } from './procurement-analytics.service';
import { ProcurementContractsService } from './procurement-contracts.service';
import {
  AnalyticsQueryDto,
  ContractStatusDto,
  ContractTermsDto,
  CreateContractDto,
} from './procurement-contracts.dto';

const MANAGE = CAPABILITIES.PURCHASES_MANAGE;

@Controller('procurement')
export class ProcurementContractsController {
  constructor(
    private readonly contracts: ProcurementContractsService,
    private readonly analyticsService: ProcurementAnalyticsService,
  ) {}

  @RequireCapability(MANAGE)
  @Get('contracts')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.contracts.list(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Get('contracts/options')
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.contracts.options(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Get('contracts/:id/versions')
  versions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.versions(user.businessId, id);
  }

  @RequireCapability(MANAGE)
  @Post('contracts')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContractDto,
  ) {
    return this.contracts.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(MANAGE)
  @Patch('contracts/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ContractTermsDto,
  ) {
    return this.contracts.updateTerms(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(MANAGE)
  @Post('contracts/:id/confirm-terms')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.confirmTerms(user.businessId, user.sub, id);
  }

  @RequireCapability(MANAGE)
  @Post('contracts/:id/status')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ContractStatusDto,
  ) {
    return this.contracts.setStatus(
      user.businessId,
      user.sub,
      id,
      dto.status,
      dto.reason,
    );
  }

  @RequireCapability(MANAGE)
  @Post('contracts/:id/remind')
  remind(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contracts.sendReminderNow(user.businessId, id);
  }

  @RequireCapability(MANAGE)
  @Get('analytics')
  analytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.analytics(user.businessId, {
      days: query.days ?? 90,
      supplierId: query.supplierId,
      department: query.department,
    });
  }
}
