import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import {
  CreateWorkflowDto,
  InstallWorkflowTemplateDto,
  UpdateWorkflowDto,
  WorkflowSchedulePreviewDto,
} from './dto/create-workflow.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { WorkflowApprovalStatus, WorkflowTriggerKey } from '@prisma/client';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { Audited } from '../../common/decorators/audited.decorator';
import { WORKFLOW_TRIGGER_CATALOG } from './workflow-trigger-catalog';
import { WorkflowApprovalsService } from './workflow-approvals.service';
import { DecideWorkflowApprovalDto } from './dto/decide-workflow-approval.dto';
import { WORKFLOW_ACTION_CATALOG } from './workflow-action-catalog';
import { buildWorkflowTemplateCatalog } from './workflow-template-catalog';
import { ListWorkflowRunsDto } from './dto/list-workflow-runs.dto';
import { PreviewWorkflowDataMappingDto } from './dto/preview-workflow-data-mapping.dto';
import { WorkflowDataMapperService } from './workflow-data-mapper.service';
import { RestoreWorkflowVersionDto } from './dto/restore-workflow-version.dto';

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly workflowTrigger: WorkflowTriggerService,
    private readonly approvals: WorkflowApprovalsService,
    private readonly dataMapper: WorkflowDataMapperService,
  ) {}

  @Get('triggers')
  triggers() {
    return WORKFLOW_TRIGGER_CATALOG;
  }

  @Get('actions')
  actions() {
    return WORKFLOW_ACTION_CATALOG;
  }

  @Get('templates')
  templates() {
    return buildWorkflowTemplateCatalog();
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Audited('install', 'workflow-template')
  @Post('templates/:templateId/install')
  installTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId') templateId: string,
    @Body() dto: InstallWorkflowTemplateDto,
  ) {
    return this.workflows.installTemplate(
      user.businessId,
      templateId,
      dto.name,
    );
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post('schedule-preview')
  previewSchedule(@Body() dto: WorkflowSchedulePreviewDto) {
    return this.workflows.previewSchedule(dto);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post('data-mapper/preview')
  previewDataMapping(@Body() dto: PreviewWorkflowDataMappingDto) {
    return this.dataMapper.preview(dto);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflows.create(user.businessId, dto);
  }

  @Get()
  list(
    @Query('triggerKey') triggerKey?: WorkflowTriggerKey,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.workflows.list(triggerKey, includeArchived === 'true');
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.workflows.summary(user.businessId);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Get('approvals')
  approvalsList(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: WorkflowApprovalStatus,
  ) {
    return this.approvals.list(user.businessId, status);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Get('runs')
  listBusinessRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: ListWorkflowRunsDto,
  ) {
    return this.workflows.listBusinessRuns(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Get('runs/:runId')
  findBusinessRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId') runId: string,
  ) {
    return this.workflows.findBusinessRun(user.businessId, runId);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post('approvals/:approvalId/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('approvalId') approvalId: string,
    @Body() dto: DecideWorkflowApprovalDto,
  ) {
    return this.approvals.decide(user, approvalId, 'approve', dto.comment);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post('approvals/:approvalId/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('approvalId') approvalId: string,
    @Body() dto: DecideWorkflowApprovalDto,
  ) {
    return this.approvals.decide(user, approvalId, 'reject', dto.comment);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflows.findOne(id);
  }

  @Get(':id/versions')
  listVersions(@Param('id') id: string) {
    return this.workflows.listVersions(id);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post(':id/versions/:version/restore')
  restoreVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: RestoreWorkflowVersionDto,
  ) {
    return this.workflows.restoreVersion(id, version, dto, user.sub);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Audited('archive', 'workflow')
  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.workflows.archive(id);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Audited('restore', 'workflow')
  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.workflows.restore(id);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Audited('duplicate', 'workflow')
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.workflows.duplicate(id);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workflows.remove(id);
  }

  @Get(':id/runs')
  listRuns(@Param('id') id: string) {
    return this.workflows.listRuns(id);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post(':id/runs/:runId/retry')
  retryRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') workflowId: string,
    @Param('runId') runId: string,
  ) {
    return this.workflowTrigger.retryFailedRun(
      user.businessId,
      workflowId,
      runId,
    );
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post(':id/runs/:runId/cancel')
  cancelRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') workflowId: string,
    @Param('runId') runId: string,
  ) {
    return this.workflowTrigger.cancelRun(
      user.businessId,
      workflowId,
      runId,
      user.sub,
    );
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.workflows.test(id);
  }
}
