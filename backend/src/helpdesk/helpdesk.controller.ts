import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { HelpdeskContextService } from './helpdesk-context.service';
import {
  HelpdeskTicketsService,
  UploadedFile,
} from './helpdesk-tickets.service';
import { HelpdeskViewsService } from './helpdesk-views.service';
import { HelpdeskAdminService } from './helpdesk-admin.service';
import { HelpdeskContentService } from './helpdesk-content.service';
import { HelpdeskJobsService } from './helpdesk-jobs.service';
import { MAX_FILE_BYTES } from './helpdesk.constants';
import {
  ActiveDto,
  AgentProfileDto,
  AnalyticsQuery,
  ApplyDto,
  ArticleActionDto,
  ArticleDto,
  AssignManyDto,
  BulkDto,
  CreateTicketDto,
  CsatSettingsDto,
  CustomerSearchQuery,
  EscalateDto,
  FollowUpDto,
  FollowUpStateDto,
  FollowersDto,
  FromConversationDto,
  LinkDto,
  MacroDto,
  MacroStatusDto,
  MergeDto,
  NameDto,
  QueueDto,
  QueueToggleDto,
  RebalanceDto,
  ReplyDto,
  RuleDto,
  SavedReplyDto,
  ScopeQuery,
  SettingsDto,
  SlaPolicyDto,
  SplitDto,
  TagDto,
  TicketFieldDto,
  TicketListQuery,
} from './dto/helpdesk.dto';

const files = () =>
  FilesInterceptor('files', 10, { limits: { fileSize: MAX_FILE_BYTES } });

/**
 * Helpdesk API. Auth and tenancy are global; every handler resolves the Helpdesk actor (403 when
 * the role lacks Helpdesk access) and each service enforces the Helpdesk permission matrix.
 */
@Controller('helpdesk')
export class HelpdeskController {
  constructor(
    private readonly ctx: HelpdeskContextService,
    private readonly tickets: HelpdeskTicketsService,
    private readonly views: HelpdeskViewsService,
    private readonly admin: HelpdeskAdminService,
    private readonly content: HelpdeskContentService,
    private readonly jobs: HelpdeskJobsService,
  ) {}

  private actor(user: AuthenticatedUser) {
    return this.ctx.actor(user);
  }

  // ── screens ──────────────────────────────────────────────────────────────

  @Get('workspace')
  async workspace(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ScopeQuery,
  ) {
    return this.views.workspace(await this.actor(user), q.branch);
  }

  @Post('access-request')
  requestAccess(@CurrentUser() user: AuthenticatedUser) {
    return this.ctx.requestAccess(user);
  }

  @Post('refresh')
  async refresh(@CurrentUser() user: AuthenticatedUser) {
    const a = await this.actor(user);
    return this.jobs.run(a.rootId);
  }

  @Get('overview')
  async overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ScopeQuery,
  ) {
    return this.views.overview(await this.actor(user), q.range, q.branch);
  }

  @Get('sla')
  async sla(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeQuery) {
    return this.views.sla(await this.actor(user), q.branch);
  }

  @Get('csat')
  async csat(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeQuery) {
    return this.views.csat(await this.actor(user), q.branch);
  }

  @Get('analytics')
  async analytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: AnalyticsQuery,
  ) {
    return this.views.analytics(await this.actor(user), q);
  }

  @Get('analytics/export')
  async exportAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: AnalyticsQuery,
    @Res() res: Response,
  ) {
    const out = await this.views.exportAnalytics(await this.actor(user), q);
    res.setHeader('Content-Type', out.type);
    res.setHeader('Content-Disposition', `attachment; filename="${out.name}"`);
    res.setHeader('X-Row-Count', String(out.count));
    res.send(out.body);
  }

  @Get('customers')
  async customers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: CustomerSearchQuery,
  ) {
    return this.tickets.customers(await this.actor(user), q.q);
  }

  // ── tickets ──────────────────────────────────────────────────────────────

  @Get('tickets')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: TicketListQuery,
  ) {
    return this.tickets.list(await this.actor(user), q);
  }

  @Get('tickets/export')
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: TicketListQuery,
    @Res() res: Response,
  ) {
    const out = await this.tickets.exportCsv(await this.actor(user), q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="helpdesk-tickets.csv"',
    );
    res.setHeader('X-Row-Count', String(out.count));
    res.send(out.csv);
  }

  @Post('tickets')
  @UseInterceptors(files())
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
    @UploadedFiles() f: UploadedFile[] = [],
  ) {
    const a = await this.actor(user);
    this.ctx.assert(
      a,
      await this.ctx.config(a.rootId),
      'Reply',
      'Creating tickets',
    );
    return this.tickets.create(a, a.rootId, dto, f);
  }

  /** Unified Inbox → "Create ticket" on a conversation. */
  @Post('tickets/from-conversation')
  async fromConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FromConversationDto,
  ) {
    const a = await this.actor(user);
    this.ctx.assert(
      a,
      await this.ctx.config(a.rootId),
      'Reply',
      'Creating tickets',
    );
    return this.tickets.createFromConversation(a, dto);
  }

  @Post('tickets/bulk')
  async bulk(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkDto) {
    return this.tickets.bulk(await this.actor(user), dto);
  }

  @Post('tickets/merge')
  async merge(@CurrentUser() user: AuthenticatedUser, @Body() dto: MergeDto) {
    return this.tickets.merge(await this.actor(user), dto);
  }

  @Get('tickets/:number')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
  ) {
    return this.tickets.detail(await this.actor(user), number);
  }

  @Patch('tickets/:number')
  async setField(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: TicketFieldDto,
  ) {
    return this.tickets.setField(await this.actor(user), number, dto);
  }

  @Delete('tickets/:number')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
  ) {
    return this.tickets.remove(await this.actor(user), number);
  }

  @Post('tickets/:number/reopen')
  async reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
  ) {
    return this.tickets.reopen(await this.actor(user), number);
  }

  @Post('tickets/:number/tags')
  async addTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: TagDto,
  ) {
    return this.tickets.tag(await this.actor(user), number, dto.tag, true);
  }

  @Delete('tickets/:number/tags/:tag')
  async removeTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Param('tag') tag: string,
  ) {
    return this.tickets.tag(await this.actor(user), number, tag, false);
  }

  @Put('tickets/:number/followers')
  async followers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: FollowersDto,
  ) {
    return this.tickets.setFollowers(
      await this.actor(user),
      number,
      dto.userIds,
    );
  }

  @Post('tickets/:number/escalate')
  async escalate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: EscalateDto,
  ) {
    return this.tickets.escalate(await this.actor(user), number, dto);
  }

  @Post('tickets/:number/split')
  async split(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: SplitDto,
  ) {
    return this.tickets.split(await this.actor(user), number, dto);
  }

  @Post('tickets/:number/links')
  async link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: LinkDto,
  ) {
    return this.tickets.link(await this.actor(user), number, dto);
  }

  @Delete('tickets/:number/links/:id')
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Param('id') id: string,
  ) {
    return this.tickets.unlink(await this.actor(user), number, id);
  }

  @Post('tickets/:number/messages')
  @UseInterceptors(files())
  async reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: ReplyDto,
    @UploadedFiles() f: UploadedFile[] = [],
  ) {
    return this.tickets.reply(await this.actor(user), number, dto, f);
  }

  @Post('tickets/:number/messages/:id/retry')
  async retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Param('id') id: string,
  ) {
    return this.tickets.retry(await this.actor(user), number, id);
  }

  @Get('tickets/:number/messages/:id/attachments/:i')
  async attachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Param('id') id: string,
    @Param('i', ParseIntPipe) i: number,
  ) {
    return this.tickets.attachmentUrl(await this.actor(user), number, id, i);
  }

  @Post('tickets/:number/apply')
  async apply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: ApplyDto,
  ) {
    return this.content.apply(
      await this.actor(user),
      number,
      dto.ref,
      dto.mode,
    );
  }

  // ── queues & assignment ──────────────────────────────────────────────────

  @Post('assignments/assign')
  async assignMany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignManyDto,
  ) {
    return this.tickets.assignMany(
      await this.actor(user),
      dto.numbers,
      dto.agentId,
    );
  }

  @Post('assignments/rebalance')
  async rebalance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RebalanceDto,
  ) {
    return this.tickets.rebalance(await this.actor(user), dto.apply);
  }

  @Post('queues')
  async createQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: QueueDto,
  ) {
    return this.admin.saveQueue(await this.actor(user), null, dto);
  }

  @Patch('queues/:id')
  async updateQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: QueueDto,
  ) {
    return this.admin.saveQueue(await this.actor(user), id, dto);
  }

  @Post('queues/:id/active')
  async toggleQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: QueueToggleDto,
  ) {
    return this.admin.toggleQueue(await this.actor(user), id, dto);
  }

  @Put('agents/:userId')
  async agent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AgentProfileDto,
  ) {
    return this.admin.saveAgent(await this.actor(user), userId, dto);
  }

  // ── SLA ──────────────────────────────────────────────────────────────────

  @Post('sla/policies')
  async createPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SlaPolicyDto,
  ) {
    return this.admin.savePolicy(await this.actor(user), null, dto);
  }

  @Patch('sla/policies/:id')
  async updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SlaPolicyDto,
  ) {
    return this.admin.savePolicy(await this.actor(user), id, dto);
  }

  @Post('sla/policies/:id/enable')
  async enablePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.admin.policyAction(await this.actor(user), id, 'enable');
  }

  @Post('sla/policies/:id/disable')
  async disablePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.admin.policyAction(await this.actor(user), id, 'disable');
  }

  @Post('sla/policies/:id/duplicate')
  async duplicatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.admin.policyAction(await this.actor(user), id, 'duplicate');
  }

  @Post('sla/rules')
  async createRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RuleDto,
  ) {
    return this.admin.saveRule(await this.actor(user), null, dto);
  }

  @Patch('sla/rules/:id')
  async updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RuleDto,
  ) {
    return this.admin.saveRule(await this.actor(user), id, dto);
  }

  @Post('sla/rules/:id/active')
  async ruleActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ActiveDto,
  ) {
    return this.admin.ruleActive(await this.actor(user), id, dto.active);
  }

  @Post('sla/escalations/:id/retry')
  async retryEscalation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.admin.retryEscalation(await this.actor(user), id);
  }

  // ── knowledge base ───────────────────────────────────────────────────────

  @Get('knowledge')
  async articles(@CurrentUser() user: AuthenticatedUser) {
    return this.content.articles(await this.actor(user));
  }

  @Post('knowledge')
  async createArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ArticleDto,
  ) {
    return this.content.saveArticle(await this.actor(user), null, dto);
  }

  @Post('knowledge/categories')
  async kbCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: NameDto,
  ) {
    return this.content.addKbCategory(await this.actor(user), dto.name);
  }

  @Patch('knowledge/:id')
  async updateArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ArticleDto,
  ) {
    return this.content.saveArticle(await this.actor(user), id, dto);
  }

  @Post('knowledge/:id/action')
  async articleAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ArticleActionDto,
  ) {
    return this.content.articleAction(await this.actor(user), id, dto.action);
  }

  @Post('knowledge/:id/view')
  async articleView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.content.articleViewed(await this.actor(user), id);
  }

  // ── saved replies & macros ───────────────────────────────────────────────

  @Get('library')
  async library(@CurrentUser() user: AuthenticatedUser) {
    return this.content.library(await this.actor(user));
  }

  @Post('replies')
  async createReply(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SavedReplyDto,
  ) {
    return this.content.saveReply(await this.actor(user), null, dto);
  }

  @Patch('replies/:id')
  async updateReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SavedReplyDto,
  ) {
    return this.content.saveReply(await this.actor(user), id, dto);
  }

  @Post('replies/:id/duplicate')
  async duplicateReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.content.duplicateReply(await this.actor(user), id);
  }

  @Delete('replies/:id')
  async deleteReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.content.deleteReply(await this.actor(user), id);
  }

  @Post('macros')
  async createMacro(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MacroDto,
  ) {
    return this.content.saveMacro(await this.actor(user), null, dto);
  }

  @Patch('macros/:id')
  async updateMacro(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MacroDto,
  ) {
    return this.content.saveMacro(await this.actor(user), id, dto);
  }

  @Post('macros/:id/status')
  async macroStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MacroStatusDto,
  ) {
    return this.content.macroStatus(
      await this.actor(user),
      id,
      dto.status as 'Active' | 'Disabled',
    );
  }

  @Delete('macros/:id')
  async deleteMacro(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.content.macroStatus(await this.actor(user), id, 'delete');
  }

  // ── CSAT & settings ──────────────────────────────────────────────────────

  @Patch('csat/settings')
  async csatSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CsatSettingsDto,
  ) {
    return this.admin.saveCsatSettings(await this.actor(user), dto);
  }

  @Post('csat/:number/follow-up')
  async followUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: FollowUpDto,
  ) {
    return this.views.followUp(
      await this.actor(user),
      number,
      dto.note,
      dto.ownerId,
    );
  }

  @Post('csat/:number/follow-up/state')
  async followUpState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: FollowUpStateDto,
  ) {
    return this.views.followUpState(await this.actor(user), number, dto.state);
  }

  @Patch('settings')
  async settings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SettingsDto,
  ) {
    return this.admin.saveSettings(
      await this.actor(user),
      dto.version,
      dto.config,
    );
  }
}
