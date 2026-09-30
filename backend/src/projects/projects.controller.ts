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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ProjectsService } from './projects.service';
import { ProjectTasksService } from './project-tasks.service';
import { ProjectMilestonesService } from './project-milestones.service';
import { ProjectFilesService } from './project-files.service';
import { ProjectTimeService } from './project-time.service';
import { ProjectApprovalsService } from './project-approvals.service';
import { ProjectPortalService } from './project-portal.service';
import { ProjectReportsService } from './project-reports.service';
import { ProjectTemplatesService } from './project-templates.service';
import { ProjectSettingsService } from './project-settings.service';
import { ProjectAiService } from './project-ai.service';
import { ProjectActivityService } from './project-activity.service';
import { FILE_MAX_BYTES } from './projects.constants';
import {
  AccessDto,
  AiAcceptDto,
  AiPlanDto,
  AiStatusDto,
  ApprovalDto,
  BulkDto,
  CommentDto,
  CreateProjectDto,
  DecisionDto,
  DependencyDto,
  IdsDto,
  InviteDto,
  RateDto,
  FileMetaDto,
  MembersDto,
  MilestoneDto,
  NotifyDto,
  ReportSaveDto,
  RescheduleDto,
  RestoreDto,
  RoleDto,
  SavedViewDto,
  ScopeQueryDto,
  SettingsDto,
  StatusDto,
  TaskDto,
  TemplateDto,
  TimeDecisionDto,
  TimeEntryDto,
  TimerStartDto,
  UpdateProjectDto,
  UploadDto,
} from './dto/projects.dto';

/**
 * Projects & Tasks. Auth and tenancy are global guards; every write is checked against the
 * business's project-role permission matrix inside the services (ProjectsPermissionsService).
 */
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly tasks: ProjectTasksService,
    private readonly milestones: ProjectMilestonesService,
    private readonly files: ProjectFilesService,
    private readonly time: ProjectTimeService,
    private readonly approvals: ProjectApprovalsService,
    private readonly portal: ProjectPortalService,
    private readonly reports: ProjectReportsService,
    private readonly templates: ProjectTemplatesService,
    private readonly settings: ProjectSettingsService,
    private readonly ai: ProjectAiService,
    private readonly activity: ProjectActivityService,
  ) {}

  // ── read models ──────────────────────────────────────────────────────────
  @Get('workspace')
  workspace(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeQueryDto) {
    return this.projects.workspace(user, q.scope);
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser, @Query() q: ScopeQueryDto) {
    return this.projects.overview(user, q.period, q.scope);
  }

  // ── projects ─────────────────────────────────────────────────────────────
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.create(user, dto);
  }

  @Post('bulk')
  bulk(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkDto) {
    return this.projects.bulk(user, dto.ids, dto.action, dto.status);
  }

  @Post('export')
  exportProjects(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IdsDto,
    @Query() q: ScopeQueryDto,
  ) {
    return this.projects.exportCsv(
      user,
      dto.ids?.length ? dto.ids : null,
      q.scope,
    );
  }

  @Get('views')
  views(@CurrentUser() user: AuthenticatedUser) {
    return this.projects.savedViews(user);
  }

  @Post('views')
  saveView(@CurrentUser() user: AuthenticatedUser, @Body() dto: SavedViewDto) {
    return this.projects.saveView(user, dto.name, dto.visibility, dto.filters);
  }

  @Delete('views/:id')
  deleteView(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.deleteView(user, id);
  }

  // ── tasks ────────────────────────────────────────────────────────────────
  @Post('tasks')
  createTask(@CurrentUser() user: AuthenticatedUser, @Body() dto: TaskDto) {
    return this.tasks.create(user, dto);
  }

  @Patch('tasks/:id')
  updateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TaskDto,
  ) {
    return this.tasks.update(user, id, dto);
  }

  @Post('tasks/:id/status')
  taskStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StatusDto,
  ) {
    return this.tasks.setStatus(user, id, dto.status);
  }

  @Delete('tasks/:id')
  deleteTask(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasks.remove(user, id);
  }

  @Post('tasks/:id/dependencies')
  addDep(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DependencyDto,
  ) {
    return this.tasks.addDependency(user, id, dto.dependsOnId);
  }

  @Delete('tasks/:id/dependencies/:dep')
  removeDep(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('dep') dep: string,
  ) {
    return this.tasks.removeDependency(user, id, dep);
  }

  @Get('tasks/:id/comments')
  taskComments(@Param('id') id: string) {
    return this.tasks.comments(id);
  }

  @Post('tasks/:id/comments')
  addTaskComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommentDto,
  ) {
    return this.tasks.addComment(user, id, dto.body);
  }

  @Post('tasks/:id/reschedule/preview')
  reschedulePreview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RescheduleDto,
  ) {
    return this.tasks.reschedulePlan(user, id, dto.dueDate);
  }

  @Post('tasks/:id/reschedule')
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RescheduleDto,
  ) {
    return this.tasks.reschedule(user, id, dto.dueDate, !!dto.withDependents);
  }

  // ── milestones ───────────────────────────────────────────────────────────
  @Post('milestones')
  createMs(@CurrentUser() user: AuthenticatedUser, @Body() dto: MilestoneDto) {
    return this.milestones.create(user, dto);
  }

  @Post('milestones/export')
  exportMs(@CurrentUser() user: AuthenticatedUser, @Body() dto: IdsDto) {
    return this.milestones.exportCsv(user, dto.ids ?? []);
  }

  @Patch('milestones/:id')
  updateMs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MilestoneDto,
  ) {
    return this.milestones.update(user, id, dto);
  }

  @Post('milestones/:id/complete')
  completeMs(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.milestones.complete(user, id);
  }

  @Post('milestones/:id/ready')
  readyMs(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.milestones.markReady(user, id);
  }

  @Delete('milestones/:id')
  deleteMs(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.milestones.remove(user, id);
  }

  // ── files ────────────────────────────────────────────────────────────────
  @Get('files')
  listFiles(@CurrentUser() user: AuthenticatedUser) {
    return this.files.list(user);
  }

  @Post('files')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES } }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDto,
  ) {
    return this.files.upload(user, file, dto);
  }

  @Post('files/:id/restore')
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RestoreDto,
  ) {
    return this.files.restore(user, id, dto.n);
  }

  @Post('files/:id/access')
  access(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AccessDto,
  ) {
    return this.files.setAccess(user, id, dto.access);
  }

  @Post('files/:id/pin')
  pin(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.files.togglePin(user, id);
  }

  @Post('files/:id/archive')
  archiveFile(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.files.archive(user, id);
  }

  @Post('files/:id/meta')
  fileMeta(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FileMetaDto,
  ) {
    return this.files.setMeta(user, id, dto);
  }

  @Get('files/:id/download')
  download(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.files.downloadUrl(user, id);
  }

  // ── activity & comments ──────────────────────────────────────────────────
  @Get('activity')
  feed(@CurrentUser() user: AuthenticatedUser) {
    return this.activity.feed(user);
  }

  @Post(':id/comments')
  postComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommentDto,
  ) {
    return this.activity.post(user, id, dto.body);
  }

  // ── time ─────────────────────────────────────────────────────────────────
  @Get('time')
  timeList(@CurrentUser() user: AuthenticatedUser) {
    return this.time.list(user);
  }

  @Post('time')
  addTime(@CurrentUser() user: AuthenticatedUser, @Body() dto: TimeEntryDto) {
    return this.time.add(user, dto);
  }

  @Post('time/timer/start')
  startTimer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TimerStartDto,
  ) {
    return this.time.start(user, dto.projectId, dto.taskId);
  }

  @Post('time/timer/stop')
  stopTimer(@CurrentUser() user: AuthenticatedUser) {
    return this.time.stop(user);
  }

  @Post('time/decide')
  decideTime(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TimeDecisionDto,
  ) {
    return this.time.decide(user, dto.ids, dto.decision, dto.reason);
  }

  @Post('time/:id/submit')
  submitTime(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.time.submit(user, id);
  }

  // ── approvals ────────────────────────────────────────────────────────────
  @Get('approvals')
  listApprovals(@CurrentUser() user: AuthenticatedUser) {
    return this.approvals.list(user);
  }

  @Post('approvals')
  createApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApprovalDto,
  ) {
    return this.approvals.create(user, dto);
  }

  @Post('approvals/:id/send')
  sendApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.approvals.send(user, id);
  }

  @Post('approvals/:id/decide')
  decideApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.approvals.decide(user, id, dto.decision, dto.comment);
  }

  @Post('approvals/:id/remind')
  remind(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvals.remind(user, id);
  }

  @Post('approvals/:id/resubmit')
  resubmit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvals.resubmit(user, id);
  }

  @Post('approvals/:id/cancel')
  cancelApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.approvals.cancel(user, id);
  }

  // ── client portal (staff side) ───────────────────────────────────────────
  @Get('portal/:projectId')
  portalPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') id: string,
  ) {
    return this.portal.preview(user, id);
  }

  @Post('portal/:projectId/invite')
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') id: string,
    @Body() dto: InviteDto,
  ) {
    return this.portal.invite(user, id, dto.email);
  }

  @Post('portal/access/:accessId/revoke')
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accessId') id: string,
  ) {
    return this.portal.revoke(user, id);
  }

  // ── reports ──────────────────────────────────────────────────────────────
  @Get('reports/saved')
  savedReports(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.saved(user);
  }

  @Post('reports/saved')
  saveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReportSaveDto,
  ) {
    return this.reports.save(user, dto.key, dto.chartType);
  }

  @Delete('reports/saved/:id')
  unsaveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.reports.unsave(user, id);
  }

  @Get('reports/:key')
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Query() q: ScopeQueryDto,
  ) {
    return this.reports.run(user, key, q.scope);
  }

  @Post('reports/:key/export')
  exportReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Query() q: ScopeQueryDto,
  ) {
    return this.reports.exportCsv(user, key, q.scope);
  }

  // ── templates ────────────────────────────────────────────────────────────
  @Get('templates')
  listTemplates() {
    return this.templates.list();
  }

  @Post('templates')
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TemplateDto,
  ) {
    return this.templates.create(user, dto);
  }

  @Post('templates/:id/publish')
  publishTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.templates.publish(user, id);
  }

  @Post('templates/:id/duplicate')
  duplicateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.templates.duplicate(user, id);
  }

  @Post('templates/:id/archive')
  archiveTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.templates.archive(user, id);
  }

  // ── settings ─────────────────────────────────────────────────────────────
  @Get('settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user);
  }

  @Put('settings')
  saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SettingsDto,
  ) {
    return this.settings.save(user, dto.config);
  }

  @Put('settings/roles/:businessUserId')
  setRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessUserId') id: string,
    @Body() dto: RoleDto,
  ) {
    return this.settings.setRole(user, id, dto.role);
  }

  @Put('settings/rates/:businessUserId')
  setRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessUserId') id: string,
    @Body() dto: RateDto,
  ) {
    return this.settings.setBillRate(user, id, dto.rate ?? null);
  }

  @Put('settings/notify')
  setNotify(@CurrentUser() user: AuthenticatedUser, @Body() dto: NotifyDto) {
    return this.settings.setNotify(user, dto.prefs);
  }

  // ── AI ───────────────────────────────────────────────────────────────────
  @Post('ai/plan')
  aiPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: AiPlanDto) {
    return this.ai.generatePlan(user, dto);
  }

  @Post('ai/accept')
  aiAccept(@CurrentUser() user: AuthenticatedUser, @Body() dto: AiAcceptDto) {
    return this.ai.acceptPlan(user, dto);
  }

  @Post('ai/status')
  aiStatus(@CurrentUser() user: AuthenticatedUser, @Body() dto: AiStatusDto) {
    return this.ai.statusDraft(user, dto.projectId, dto.audience);
  }

  // ── single project (param routes last) ───────────────────────────────────
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(user, id, dto);
  }

  @Put(':id/members')
  members(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MembersDto,
  ) {
    return this.projects.setMembers(user, id, dto.members);
  }

  @Post(':id/favorite')
  favorite(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.toggleFavorite(user, id);
  }

  @Get(':id/links')
  links(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.links(user, id);
  }

  @Get(':id/readiness')
  readiness(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.readiness(user, id);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.complete(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.remove(user, id);
  }
}
