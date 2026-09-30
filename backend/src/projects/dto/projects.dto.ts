import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ScopeQueryDto {
  @IsOptional() @IsString() scope?: string;
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsString() branch?: string;
}

export class CreateProjectDto {
  @IsString() @MaxLength(191) name!: string;
  @IsOptional() @IsString() customerId?: string | null;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() managerId?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) team?: string[];
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsOptional() @IsBoolean() dueLocked?: boolean;
  @IsOptional() @IsString() objective?: string;
  @IsOptional() @IsString() deliverables?: string;
  @IsOptional() @IsString() exclusions?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) budget?: number | null;
  @IsOptional() @IsString() billingType?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() templateId?: string | null;
  @IsOptional() @IsBoolean() requireClientApproval?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) automationRefs?: string[];
  @IsOptional() @IsString() visibility?: string;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MaxLength(191) name?: string;
  @IsOptional() @IsString() customerId?: string | null;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() managerId?: string | null;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsOptional() @IsBoolean() dueLocked?: boolean;
  @IsOptional() @IsString() objective?: string;
  @IsOptional() @IsString() deliverables?: string;
  @IsOptional() @IsString() exclusions?: string;
  @IsOptional() budget?: number | null;
  @IsOptional() @IsString() billingType?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsBoolean() requireClientApproval?: boolean;
  @IsOptional() @IsString() visibility?: string;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
  @IsOptional() @IsBoolean() confirmDueChange?: boolean;
}

export class MembersDto {
  @IsArray() members!: Array<{
    personId: string;
    roleLabel?: string;
    allocationPct?: number;
  }>;
}

export class BulkDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
  @IsIn(['status', 'archive']) action!: 'status' | 'archive';
  @IsOptional() @IsString() status?: string;
}

export class IdsDto {
  @IsOptional() @IsArray() @IsString({ each: true }) ids?: string[];
}

export class SavedViewDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() visibility!: string;
  @IsObject() filters!: Record<string, unknown>;
}

export class TaskDto {
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() assigneeId?: string | null;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimateMins?: number;
  @IsOptional() @IsString() parentTaskId?: string | null;
  @IsOptional() @IsBoolean() clientVisible?: boolean;
  @IsOptional() @IsArray() checklist?: Array<{
    t: string;
    done: boolean;
    req: boolean;
  }>;
  @IsOptional() @IsBoolean() blocked?: boolean;
  @IsOptional() @IsString() blockType?: string | null;
  @IsOptional() @IsString() blockerNote?: string | null;
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

export class RateDto {
  @IsOptional() @Type(() => Number) @IsNumber() rate?: number | null;
}

export class FileMetaDto {
  @IsOptional() @IsString() @MaxLength(60) folder?: string;
  @IsOptional() @IsIn(['project', 'task', 'milestone']) linkType?: string;
  @IsOptional() @IsString() linkId?: string | null;
}

export class StatusDto {
  @IsString() status!: string;
}

export class DependencyDto {
  @IsString() dependsOnId!: string;
}

export class CommentDto {
  @IsString() @MaxLength(5000) body!: string;
}

export class RescheduleDto {
  @IsString() dueDate!: string;
  @IsOptional() @IsBoolean() withDependents?: boolean;
}

export class MilestoneDto {
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() @MaxLength(191) name?: string;
  @IsOptional() @IsString() ownerId?: string | null;
  @IsOptional() @IsString() plannedDate?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() approvalMode?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) taskIds?: string[];
}

export class UploadDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() folder?: string;
  @IsOptional() @IsString() access?: string;
  @IsOptional() @IsString() linkType?: string;
  @IsOptional() @IsString() linkId?: string;
  @IsOptional() @IsString() fileId?: string;
  @IsOptional() @IsString() note?: string;
}

export class AccessDto {
  @IsString() access!: string;
}

export class RestoreDto {
  @Type(() => Number) @IsNumber() n!: number;
}

export class TimerStartDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() taskId?: string | null;
}

export class TimeEntryDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() taskId?: string | null;
  @IsString() date!: string;
  @Type(() => Number) @IsNumber() hours!: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsBoolean() billable?: boolean;
}

export class TimeDecisionDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
  @IsIn(['approved', 'rejected']) decision!: 'approved' | 'rejected';
  @IsOptional() @IsString() reason?: string;
}

export class ApprovalDto {
  @IsString() projectId!: string;
  @IsString() type!: string;
  @IsString() @MaxLength(255) item!: string;
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsString() evidenceFileId?: string | null;
  @IsOptional() @IsString() milestoneId?: string | null;
  @IsString() approver!: string;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsOptional() @IsBoolean() draft?: boolean;
}

export class DecisionDto {
  @IsIn(['Approved', 'Changes Requested', 'Rejected']) decision!: string;
  @IsOptional() @IsString() comment?: string;
}

export class InviteDto {
  @IsOptional() @IsString() email?: string;
}

export class PortalTokenDto {
  @IsString() token!: string;
  @IsOptional() @IsString() code?: string;
}

export class PortalMessageDto {
  @IsString() @MaxLength(5000) body!: string;
}

export class ReportSaveDto {
  @IsString() key!: string;
  @IsString() chartType!: string;
}

export class TemplateDto {
  @IsString() @MaxLength(191) name!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() businessType?: string;
  @IsOptional() @IsString() billing?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsArray() phases?: Array<{
    name: string;
    days: number;
    tasks: string[];
  }>;
  @IsOptional() @IsArray() @IsString({ each: true }) milestones?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
  @IsOptional() @IsString() docs?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) hooks?: string[];
  @IsOptional() @IsBoolean() chain?: boolean;
  @IsOptional() @IsBoolean() taskChain?: boolean;
  @IsOptional() @IsBoolean() publish?: boolean;
}

export class SettingsDto {
  @IsObject() config!: Record<string, unknown>;
}

export class RoleDto {
  @IsString() role!: string;
}

export class NotifyDto {
  @IsObject() prefs!: Record<string, boolean>;
}

export class AiPlanDto {
  @IsString() projectId!: string;
  @IsString() @MaxLength(4000) goal!: string;
  @IsOptional() @IsString() due?: string;
  @IsOptional() @IsString() @MaxLength(500) constraints?: string;
}

export class AiAcceptDto {
  @IsString() projectId!: string;
  @IsObject() plan!: {
    phases: Array<{
      name: string;
      days: number;
      tasks: Array<{ title: string; role: string; est: number }>;
    }>;
    ms: string[];
  };
  @IsOptional() @IsString() due?: string;
}

export class AiStatusDto {
  @IsString() projectId!: string;
  @IsIn(['Internal', 'Client']) audience!: 'Internal' | 'Client';
}
