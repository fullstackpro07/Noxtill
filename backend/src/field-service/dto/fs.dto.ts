import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Screen / drawer / export scope (JSON-encoded objects arrive as strings). */
export class FsScopeQuery {
  @IsOptional() @IsString() tab?: string;
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() f?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() view?: string;
  @IsOptional() @IsString() cur?: string;
  @IsOptional() @IsString() sec?: string;
  @IsOptional() @IsString() dDay?: string;
  @IsOptional() @IsString() techView?: string;
  @IsOptional() @IsString() what?: string;
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: string;
  @IsOptional() @IsString() ids?: string;
}

export class FormDataDto {
  /** JSON payload of a multipart form. */
  @IsString() @MaxLength(20000) data!: string;
}

export class StageDto {
  @IsIn(['before', 'during', 'after', 'evidence', 'attachment']) stage!: string;
}

export class KeyDto {
  @IsOptional() @IsString() @MaxLength(120) key?: string;
}

export class ReasonDto extends KeyDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class VersionDto {
  @IsOptional() @Type(() => Number) @IsInt() expected?: number | null;
}

class PartLineDto {
  @IsString() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) qty!: number;
}

export class WoDto extends KeyDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() siteId?: string | null;
  @IsOptional() @IsString() assetId?: string | null;
  @IsString() serviceTypeId!: string;
  @IsString() @MaxLength(4000) scope!: string;
  @IsString() priority!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(62) day?:
    number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(23.5) h?:
    number | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PartLineDto)
  parts?: PartLineDto[];
  @IsOptional() @IsString() warrantyId?: string | null;
  @IsOptional() @IsString() requestId?: string | null;
}

export class AssignDto extends VersionDto {
  @IsString() tech!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(62) day!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(23.5) h!: number;
  @IsOptional() @IsString() @MaxLength(500) override?: string;
}

export class PreviewDto {
  @IsString() tech!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(62) day!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(23.5) h!: number;
}

export class ScheduleDto extends VersionDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(62) day!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(23.5) h!: number;
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsBoolean() notify?: boolean;
}

export class PriorityDto extends VersionDto {
  @IsString() priority!: string;
  @IsString() @MaxLength(500) reason!: string;
}

export class TechActDto extends ReasonDto {
  @IsIn(['Accept', 'Start travel', 'Arrived', 'Start job', 'Pause', 'Resume'])
  act!: string;
}

export class ChecklistDto extends KeyDto {
  @Type(() => Number) @IsInt() @Min(0) index!: number;
  @IsString() @MaxLength(200) value!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SignDto extends KeyDto {
  @IsString() @MaxLength(120) name!: string;
  @IsBoolean() ack!: boolean;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class NoteDto extends KeyDto {
  @IsString() @MaxLength(2000) text!: string;
}

export class CompleteDto extends KeyDto {
  @IsString() @MaxLength(4000) resolution!: string;
  @IsBoolean() fixed!: boolean;
  @IsOptional() @IsString() @MaxLength(500) why?: string;
}

export class BulkDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[];
  @IsIn(['assign', 'schedule', 'status']) op!: 'assign' | 'schedule' | 'status';
  @IsOptional() @IsString() tech?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(62) day?: number;
  @IsOptional() @IsString() st?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ReportDto {
  @IsString() @MaxLength(200000) html!: string;
}
export class SummaryDto {
  @IsString() @MaxLength(1000) summary!: string;
}

export class AddPartDto {
  @IsString() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) qty!: number;
}

export class UsePartDto extends KeyDto {
  @Type(() => Number) @IsInt() @Min(1) qty!: number;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
  @IsOptional() @IsString() @MaxLength(80) serial?: string;
}

export class ProcureDto {
  @IsString() supplierId!: string;
}

export class LaborDto {
  @IsString() tech!: string;
  @IsString() woId!: string;
  @IsString() type!: string;
  @Type(() => Number) @IsInt() @Min(-31) @Max(0) day!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(24) s!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(24) e!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(600) brk!: number;
  @IsBoolean() billable!: boolean;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

export class LaborActDto {
  @IsIn(['Stop timer', 'Submit', 'Approve', 'Reject']) act!:
    'Stop timer' | 'Submit' | 'Approve' | 'Reject';
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

export class TriageDto {
  @IsString() result!: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() serviceTypeId?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ConvertDto extends KeyDto {
  @IsString() priority!: string;
  @IsString() @MaxLength(4000) scope!: string;
}

export class TextDto {
  @IsString() @MaxLength(2000) text!: string;
}

export class RejectDto {
  @IsString() @MaxLength(255) reason!: string;
  @IsOptional() @IsString() @MaxLength(1000) cust?: string;
}

export class PlanDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() customerId!: string;
  @IsOptional() @IsString() assetId?: string | null;
  @IsOptional() @IsString() siteId?: string | null;
  @IsString() serviceTypeId!: string;
  @IsString() trigger!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) freq!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(3650) firstDueDays!: number;
  @IsOptional() @IsString() @MaxLength(60) window?: string;
  @IsBoolean() autoCreate!: boolean;
  @IsBoolean() approval!: boolean;
}

export class ActiveDto {
  @IsBoolean() active!: boolean;
}

export class TemplateDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() serviceTypeId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) assetType?: string;
  @IsString() @MaxLength(10000) items!: string;
}

export class TemplateActDto {
  @IsIn(['Duplicate', 'Publish version']) act!: 'Duplicate' | 'Publish version';
}

export class AgreementDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() contractId?: string | null;
  @IsString() startOn!: string;
  @IsString() endOn!: string;
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) assetIds!: string[];
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  serviceTypeIds!: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(1000) visits!: number;
  @IsString() @MaxLength(40) freq!: string;
  @Type(() => Number) @IsInt() @Min(1) respH!: number;
  @Type(() => Number) @IsInt() @Min(1) resH!: number;
  @IsString() @MaxLength(60) labor!: string;
  @IsString() @MaxLength(60) parts!: string;
  @IsString() renewal!: string;
}

export class SuspendDto {
  @IsBoolean() suspend!: boolean;
  @IsString() @MaxLength(255) reason!: string;
}

export class CaseDto {
  @IsString() customerId!: string;
  @IsString() assetId!: string;
  @IsString() @MaxLength(2000) issue!: string;
  @IsOptional() @IsString() @MaxLength(80) source?: string;
}

export class WrnRejectDto {
  @IsString() @MaxLength(120) reason!: string;
  @IsString() @MaxLength(255) ev!: string;
  @IsString() @MaxLength(1000) cust!: string;
  @IsOptional() @IsString() @MaxLength(500) int?: string;
  @IsOptional() @IsString() follow?: string;
}

export class DecideDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

export class LockDto {
  @IsBoolean() on!: boolean;
}

export class SettingsDto {
  @Type(() => Number) @IsInt() expectedVersion!: number;
  @IsObject() config!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class SettingsDiffDto {
  @IsObject() config!: Record<string, unknown>;
}

export class ServiceTypeDto {
  @IsString() @MaxLength(16) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsString() skill!: string;
  @IsOptional() @IsString() cert?: string | null;
  @Type(() => Number) @IsInt() durMin!: number;
  @IsString() priority!: string;
  @IsString() @MaxLength(60) proof!: string;
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  partProductIds!: string[];
  @IsOptional() @IsString() laborProductId?: string | null;
}

export class TechnicianDto {
  @IsString() userId!: string;
  @IsArray() @IsString({ each: true }) skills!: string[];
  @IsArray() @IsString({ each: true }) certs!: string[];
  @IsArray() @IsString({ each: true }) territories!: string[];
  @Type(() => Number) @IsNumber() shiftStart!: number;
  @Type(() => Number) @IsNumber() shiftEnd!: number;
  @IsBoolean() tracking!: boolean;
  @IsBoolean() active!: boolean;
}

export class TechStatusDto {
  @IsIn(['', 'Break', 'Off Duty']) status!: string;
}

export class SiteDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsString() @MaxLength(255) address!: string;
  @IsString() zone!: string;
  @IsOptional() @IsString() @MaxLength(1000) access?: string;
  @IsOptional() @IsString() @MaxLength(1000) safety?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class EquipmentSiteDto {
  @IsString() siteId!: string;
}
