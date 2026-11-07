import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { SeoAuditIssueStatus } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoAutopilotService } from './seo-autopilot.service';
import { SeoSiteAuditService } from './seo-site-audit.service';
import { SeoAuditIssuesService } from './seo-audit-issues.service';
import { SeoAuditIssueReasonDto } from './dto/seo-audit-issue-reason.dto';
import { SeoAuditScheduleDto } from './dto/seo-audit-schedule.dto';
import { SeoAuditScheduleService } from './seo-audit-schedule.service';

@Controller('seo-autopilot')
export class SeoAutopilotController {
  constructor(
    private readonly seoAutopilot: SeoAutopilotService,
    private readonly siteAudit: SeoSiteAuditService,
    private readonly auditIssues: SeoAuditIssuesService,
    private readonly auditSchedule: SeoAuditScheduleService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.seoAutopilot.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Get('audit-schedule')
  getAuditSchedule(@CurrentUser() user: AuthenticatedUser) {
    return this.auditSchedule.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Put('audit-schedule')
  saveAuditSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SeoAuditScheduleDto,
  ) {
    return this.auditSchedule.save(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Get('issues')
  listIssues(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.auditIssues.list(
      user.businessId,
      status as SeoAuditIssueStatus | undefined,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('issues/:id/ignore')
  ignoreIssue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SeoAuditIssueReasonDto,
  ) {
    return this.auditIssues.ignore(user, id, dto.reason);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('issues/:id/reopen')
  reopenIssue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SeoAuditIssueReasonDto,
  ) {
    return this.auditIssues.reopen(user, id, dto.reason);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Get('audits')
  listAudits(@CurrentUser() user: AuthenticatedUser) {
    return this.siteAudit.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Get('audits/:id/changes')
  getAuditChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.siteAudit.compare(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Get('audits/:id')
  getAudit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.siteAudit.get(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Post('audits')
  runAudit(@CurrentUser() user: AuthenticatedUser) {
    return this.siteAudit.run(user.businessId);
  }
}
