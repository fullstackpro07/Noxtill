import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { ReportRunsService } from './report-runs.service';
import { TaxReportsService } from './tax-reports.service';
import {
  AiBuilderDto,
  GenerateReportDto,
  RecordFilingDto,
  SendReportDto,
  TaxReminderDto,
  TaxSettingsDto,
} from './dto/generate-report.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { isReportKind } from './reports.types';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly runs: ReportRunsService,
    private readonly tax: TaxReportsService,
  ) {}

  private active(user: AuthenticatedUser): string {
    return this.runs.activeBusinessId(user.businessId);
  }

  /** The Reports library: every report with its latest run for the period, plus the KPI strip. */
  @Get('library')
  library(@CurrentUser() user: AuthenticatedUser, @Query('period') period?: string) {
    if (period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException('period must be in YYYY-MM format');
    }
    return this.runs.library(this.active(user), user.role, user.sub, period);
  }

  @Put('favorites/:kind')
  toggleFavorite(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string) {
    return this.runs.toggleFavorite(this.active(user), user.sub, kind);
  }

  @Post('ai-builder')
  aiBuilder(@CurrentUser() user: AuthenticatedUser, @Body() dto: AiBuilderDto) {
    return this.runs.parseRequest(this.active(user), user.role, dto.request);
  }

  // ---- Tax Reports -------------------------------------------------------------------

  /** UPD-BE-117 — the real structured summary behind the Tax Reports screen. */
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  @Get('tax')
  taxSummary(@CurrentUser() user: AuthenticatedUser, @Query('period') period?: string) {
    return this.tax.summary(this.active(user), period);
  }

  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  @Get('tax/excel')
  taxExcel(@CurrentUser() user: AuthenticatedUser, @Query('period') period?: string) {
    return this.tax.excel(this.active(user), period);
  }

  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  @Put('tax/settings')
  taxSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: TaxSettingsDto) {
    if (user.role !== Role.owner) throw new ForbiddenException('Only the owner can change the filing day.');
    return this.tax.setFilingDay(this.active(user), dto.filingDay);
  }

  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  @Post('tax/filings')
  recordFiling(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordFilingDto) {
    if (user.role !== Role.owner) throw new ForbiddenException('Only the owner can record a return as filed.');
    return this.tax.recordFiling(this.active(user), user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  @Post('tax/reminders')
  remind(@CurrentUser() user: AuthenticatedUser, @Body() dto: TaxReminderDto) {
    return this.tax.remind(this.active(user), user.sub, dto.period);
  }

  // ---- One report run ---------------------------------------------------------------

  @Get('runs/:id')
  run(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.runs.getRun(this.active(user), id);
  }

  @Get('runs/:id/explain')
  explain(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.runs.explain(this.active(user), id);
  }

  @Get('runs/:id/audit')
  audit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.runs.audit_trail(this.active(user), id);
  }

  @Post('runs/:id/download')
  download(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.runs.download(this.active(user), user.sub, id);
  }

  @Post('runs/:id/send')
  sendRun(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendReportDto) {
    return this.runs.send(this.active(user), { userId: user.sub, role: user.role }, id, dto);
  }

  // ---- Generate ---------------------------------------------------------------------

  @Post(':kind')
  generate(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string, @Body() dto: GenerateReportDto) {
    if (!isReportKind(kind)) throw new BadRequestException(`Unknown report kind: ${kind}`);
    return this.reports.generate(kind, dto.month, user, dto.trigger);
  }

  /** Generate, then send the link to the caller's own contact (the original one-click "Send"). */
  @Post(':kind/send')
  async send(@CurrentUser() user: AuthenticatedUser, @Param('kind') kind: string, @Body() dto: GenerateReportDto) {
    if (!isReportKind(kind)) throw new BadRequestException(`Unknown report kind: ${kind}`);
    const { run } = await this.reports.generate(kind, dto.month, user, dto.trigger);
    return this.runs.send(this.active(user), { userId: user.sub, role: user.role }, run.id);
  }
}
