import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { InboxService } from './inbox.service';
import { InboxViewsService } from './inbox-views.service';
import { InboxRepliesService } from './inbox-replies.service';
import { InboxRulesService } from './inbox-rules.service';
import { InboxSettingsService } from './inbox-settings.service';
import { InboxAutomationService } from './inbox-automation.service';
import {
  AssignDto,
  ComposeDto,
  FillReplyDto,
  FolderDto,
  ListConversationsQueryDto,
  NoteDto,
  ReplyDto,
  RuleDto,
  SavedReplyDto,
  SendDraftDto,
  SnoozeDto,
  StarDto,
  TagsDto,
  TimelineQueryDto,
  TranslateDto,
  UpdateInboxSettingsDto,
  UpdateRuleDto,
  UpdateSavedReplyDto,
} from './dto/inbox.dto';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

class CreateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  email?: string;
}

class AwayDto {
  @IsBoolean()
  on!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

/** Unified Inbox. Auth + tenancy are global guards; only configuration routes need `inbox.manage`. */
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly views: InboxViewsService,
    private readonly replies: InboxRepliesService,
    private readonly rules: InboxRulesService,
    private readonly settings: InboxSettingsService,
    private readonly automation: InboxAutomationService,
  ) {}

  @Get('overview')
  async overview(@CurrentUser() user: AuthenticatedUser) {
    // Pull in any social messages the connector stored since the last tick, so the rail is current.
    await this.automation.syncSocial(user.businessId);
    return this.views.overview(user);
  }

  @Get('conversations')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.inbox.list(user, query);
  }

  @Post('conversations')
  compose(@CurrentUser() user: AuthenticatedUser, @Body() dto: ComposeDto) {
    return this.inbox.compose(user, dto);
  }

  @Post('conversations/read-all')
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.markAllRead(user);
  }

  @Get('conversations/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inbox.detail(user, id);
  }

  @Post('conversations/:id/read')
  read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inbox.markRead(user, id);
  }

  @Post('conversations/:id/reply')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.inbox.reply(user, id, dto.text, dto.savedReplyId);
  }

  @Post('conversations/:id/note')
  note(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: NoteDto,
  ) {
    return this.inbox.note(user, id, dto.text);
  }

  @Post('conversations/:id/assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignDto,
  ) {
    return this.inbox.assign(user, id, dto);
  }

  @Post('conversations/:id/snooze')
  snooze(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SnoozeDto,
  ) {
    return this.inbox.snooze(user, id, dto.minutes);
  }

  @Post('conversations/:id/close')
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inbox.close(user, id);
  }

  @Post('conversations/:id/reopen')
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inbox.reopen(user, id);
  }

  @Patch('conversations/:id/star')
  star(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StarDto,
  ) {
    return this.inbox.star(user, id, dto.starred);
  }

  @Put('conversations/:id/tags')
  tags(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TagsDto,
  ) {
    return this.inbox.setTags(user, id, dto.tags);
  }

  @Post('conversations/:id/customer')
  createCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.inbox.createCustomer(user, id, dto);
  }

  @Post('conversations/:id/customer-note')
  customerNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: NoteDto,
  ) {
    return this.inbox.addCustomerNote(user, id, dto.text);
  }

  @Get('conversations/:id/customer360')
  customer360(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.views.customer360(user, id);
  }

  @Get('conversations/:id/timeline')
  timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: TimelineQueryDto,
  ) {
    return this.views.timeline(user, id, q.filter);
  }

  @Post('conversations/:id/draft')
  draft(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inbox.draft(user, id);
  }

  @Post('conversations/:id/translate')
  translate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TranslateDto,
  ) {
    return this.inbox.translate(user, id, dto.text);
  }

  @Get('conversations/:id/summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inbox.summary(user, id);
  }

  @Post('drafts/:id/send')
  sendDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendDraftDto,
  ) {
    return this.inbox.sendDraft(user, id, dto.text);
  }

  @Post('drafts/:id/discard')
  discardDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inbox.discardDraft(user, id);
  }

  @Get('team')
  team(@CurrentUser() user: AuthenticatedUser) {
    return this.views.team(user);
  }

  @Get('attention')
  attention(@CurrentUser() user: AuthenticatedUser) {
    return this.views.attention(user);
  }

  @Get('analytics')
  analytics(@CurrentUser() user: AuthenticatedUser) {
    return this.views.analytics(user);
  }

  @Get('channels')
  channels(@CurrentUser() user: AuthenticatedUser) {
    return this.views.channels(user);
  }

  @Get('ai-assist')
  aiAssist(@CurrentUser() user: AuthenticatedUser) {
    return this.views.aiAssist(user);
  }

  @Get('ai-actions')
  aiActions(@CurrentUser() user: AuthenticatedUser) {
    return this.views.aiActions(user);
  }

  @Get('replies')
  listReplies(
    @CurrentUser() user: AuthenticatedUser,
    @Query('folder') folder?: string,
    @Query('q') q?: string,
  ) {
    return this.replies.list(user, folder, q);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Post('replies')
  createReply(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SavedReplyDto,
  ) {
    return this.replies.create(user, dto);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Patch('replies/:id')
  updateReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavedReplyDto,
  ) {
    return this.replies.update(user, id, dto);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Post('replies/:id/duplicate')
  duplicateReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.replies.duplicate(user, id);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Delete('replies/:id')
  deleteReply(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.replies.remove(user, id);
  }

  @Post('replies/:id/fill')
  fillReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FillReplyDto,
  ) {
    return this.replies.fill(user, id, dto.conversationId);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Post('reply-folders')
  createFolder(@CurrentUser() user: AuthenticatedUser, @Body() dto: FolderDto) {
    return this.replies.createFolder(user, dto.name);
  }

  @Get('rules')
  listRules(@CurrentUser() user: AuthenticatedUser) {
    return this.views.automations(user);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Post('rules')
  createRule(@CurrentUser() user: AuthenticatedUser, @Body() dto: RuleDto) {
    return this.rules.create(user, dto);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Patch('rules/:id')
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.rules.update(user, id, dto);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Post('rules/:id/toggle')
  toggleRule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rules.toggle(user, id);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Delete('rules/:id')
  deleteRule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rules.remove(user, id);
  }

  @Get('rules/:id/history')
  ruleHistory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.views.ruleHistory(user, id);
  }

  @Get('settings')
  settingsView(@CurrentUser() user: AuthenticatedUser) {
    return this.views.settingsView(user);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Patch('settings')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateInboxSettingsDto,
  ) {
    await this.settings.update(user.businessId, dto);
    return this.views.settingsView(user);
  }

  @RequireCapability(CAPABILITIES.INBOX_MANAGE)
  @Post('settings/away')
  async away(@CurrentUser() user: AuthenticatedUser, @Body() dto: AwayDto) {
    await this.rules.setAway(user, dto.on, dto.message);
    return this.views.settingsView(user);
  }
}
