import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoAgentWorkspaceService } from './seo-agent-workspace.service';
import { SeoSpecialistAgentService } from './seo-specialist-agent.service';

class GenerateOpportunityBriefDto {
  @IsOptional() @IsString() @MaxLength(2000) strategyNote?: string;
}

/** Workspace decisions use owning services; agent drafts enter the canonical Content workflow. */
@Controller('seo-autopilot/workspace')
export class SeoAgentWorkspaceController {
  constructor(
    private readonly workspace: SeoAgentWorkspaceService,
    private readonly agent: SeoSpecialistAgentService,
  ) {}

  @Get()
  queue(@CurrentUser() user: AuthenticatedUser) {
    return this.workspace.queue(user.businessId);
  }

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.workspace.history(user.businessId);
  }

  @Get('agent-runs')
  agentRuns() {
    return this.agent.listRuns();
  }

  @RequireCapability(CAPABILITIES.SEO_AGENT_RUN)
  @Post('agent-runs')
  runAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.agent.run(user.businessId, user.sub, idempotencyKey);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('content-opportunities/:keywordId/brief')
  generateOpportunityBrief(
    @CurrentUser() user: AuthenticatedUser,
    @Param('keywordId') keywordId: string,
    @Body() dto?: GenerateOpportunityBriefDto,
  ) {
    return this.agent.generateOpportunityBrief(
      user.businessId,
      user.sub,
      keywordId,
      dto?.strategyNote,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('audit-findings/:issueId/on-page-revision')
  generateOnPageRevision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('issueId') issueId: string,
  ) {
    return this.agent.generateOnPageRevision(
      user.businessId,
      user.sub,
      issueId,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('audit-findings/:issueId/technical-review')
  prepareTechnicalReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('issueId') issueId: string,
  ) {
    return this.agent.prepareTechnicalReview(
      user.businessId,
      user.sub,
      issueId,
    );
  }
}
