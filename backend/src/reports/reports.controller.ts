import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { isReportKind } from './reports.types';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** UPD-BE-117 — the real structured summary behind the Tax Reports screen (cards/chart/table). */
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  @Get('tax')
  taxSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('period') period?: string,
  ) {
    return this.reports.taxSummary(user.businessId, period);
  }

  @Post(':kind')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Body() dto: GenerateReportDto,
  ) {
    if (!isReportKind(kind)) {
      throw new BadRequestException(`Unknown report kind: ${kind}`);
    }
    return this.reports.generate(kind, dto.month, user);
  }

  @Post(':kind/send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Body() dto: GenerateReportDto,
  ) {
    if (!isReportKind(kind)) {
      throw new BadRequestException(`Unknown report kind: ${kind}`);
    }
    return this.reports.send(kind, dto.month, user);
  }
}
