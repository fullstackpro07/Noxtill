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
  MaxLength,
} from 'class-validator';

export class PpScopeQuery {
  @IsOptional() @IsString() tab?: string;
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() dept?: string;
  @IsOptional() @IsString() f?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() view?: string;
  @IsOptional() @IsString() run?: string;
  @IsOptional() @IsString() what?: string;
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: string;
  @IsOptional() @IsIn(['mask', 'full']) pii?: string;
}

/** JSON payload of a multipart form. */
export class FormDataDto {
  @IsString() @MaxLength(60000) data!: string;
}

export class ActDto {
  @IsString() @MaxLength(40) act!: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsString() @MaxLength(60) typed?: string;
  @IsOptional() @IsString() @MaxLength(1000) override?: string;
  @IsOptional() @IsString() @MaxLength(60) runId?: string;
  @IsOptional() @Type(() => Number) @IsInt() expectedVersion?: number;
  @IsOptional() @IsString() @MaxLength(20) expectedStatus?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(1000) results?: {
    uid: string;
    status: string;
    ref?: string;
  }[];
}

export class ProfileDto {
  @IsOptional() @Type(() => Number) @IsInt() expectedVersion?: number;
  @IsOptional() @IsString() @MaxLength(60) department?: string;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() employmentType?: string;
  @IsOptional() @IsString() managerUserId?: string | null;
  @IsOptional() @IsString() payBasis?: string;
  @IsOptional() monthlySalary?: number | string | null;
  @IsOptional() hourlyRate?: number | string | null;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() probationEnd?: string | null;
  @IsOptional() @IsString() contractEnd?: string | null;
  @IsOptional() @IsString() status?: string;
  @IsOptional() inPayroll?: boolean | string;
  @IsOptional() @IsString() @MaxLength(80) bankName?: string | null;
  @IsOptional() @IsString() @MaxLength(40) bankAccount?: string | null;
  @IsOptional() @IsString() @MaxLength(120) bankTitle?: string | null;
  @IsOptional() @IsString() taxStatus?: string | null;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string | null;
}

export class JobDto {
  @IsOptional() @Type(() => Number) @IsInt() expectedVersion?: number;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(60) department?: string;
  @IsOptional() @IsString() branchId?: string | null;
  @IsOptional() @IsString() workMode?: string;
  @IsOptional() @IsString() employmentType?: string;
  @IsOptional() target?: number | string;
  @IsOptional() @IsString() managerUserId?: string | null;
  @IsOptional() @IsString() recruiterUserId?: string | null;
  @IsOptional() compMin?: number | string | null;
  @IsOptional() compMax?: number | string | null;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
  @IsOptional() @IsString() @MaxLength(80) budgetRef?: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @IsOptional() targetDays?: number | string;
}

export class StageDto {
  @IsString() to!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @Type(() => Number) @IsInt() expectedVersion?: number;
}
export class RejectDto {
  @IsString() @MaxLength(120) reason!: string;
  @IsString() @MaxLength(500) note!: string;
  @IsOptional() @IsBoolean() message?: boolean;
}
export class MessageDto {
  @IsIn(['message', 'document']) kind!: 'message' | 'document';
  @IsString() @MaxLength(4000) text!: string;
}
export class HireDto {
  @IsOptional() @IsIn(['link', 'new', '']) how?: 'link' | 'new' | '';
}

export class IntDto {
  @IsOptional() @IsString() candidateId?: string;
  @IsOptional() @IsString() round?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() time?: string;
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @IsOptional() durationMin?: number | string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  interviewers?: string[];
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() force?: boolean | string;
}
export class ScoreDto {
  @IsString() interviewer!: string;
  @IsArray() @ArrayMaxSize(8) r!: (number | string)[];
  @IsString() rec!: string;
  @IsString() @MaxLength(2000) note!: string;
  @IsOptional() @IsString() @MaxLength(500) why?: string;
}

export class OfferDto {
  @IsOptional() @IsString() candidateId?: string;
  @IsOptional() @IsString() employmentType?: string;
  @IsOptional() @IsString() branchId?: string | null;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() comp?: number | string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @IsString() @MaxLength(255) benefits?: string;
  @IsOptional() @IsString() @MaxLength(20) probation?: string;
  @IsOptional() @IsString() @MaxLength(255) conditions?: string;
  @IsOptional() expiresInDays?: number | string;
  @IsOptional() @IsString() @MaxLength(500) why?: string;
  @IsOptional() @Type(() => Number) @IsInt() expectedVersion?: number;
}

export class RunStartDto {
  @IsOptional() @IsString() period?: string;
}
export class CorrectionDto {
  @IsString() runId!: string;
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) ids!: string[];
}
export class ExcDto {
  @Type(() => Number) @IsInt() idx!: number;
  @IsIn(['exclude', 'accept']) how!: 'exclude' | 'accept';
}
export class FixDto {
  @IsIn(['ts', 'tax', 'bank']) kind!: string;
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) ids!: string[];
}

export class RuleDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() pp?: string;
  @IsOptional() @IsString() @MaxLength(80) cls?: string;
  @IsOptional() @IsString() @MaxLength(80) fin?: string;
  @IsOptional() @IsString() @MaxLength(120) prov?: string;
  @IsOptional() @IsString() @MaxLength(120) elig?: string;
  @IsOptional() ee?: number | string | null;
  @IsOptional() er?: number | string | null;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() @MaxLength(500) why?: string;
}
export class AssignDto {
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) ids!: string[];
  @IsBoolean() on!: boolean;
}
export class DeptDto {
  @IsString() @MaxLength(60) dept!: string;
}
export class DateDto {
  @IsString() to!: string;
}

export class LeaveActDto {
  @IsIn(['approve', 'reject', 'cancel']) act!: 'approve' | 'reject' | 'cancel';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() expectedStatus?: string;
}

export class OnbEditDto {
  @IsOptional() @IsString() managerUserId?: string | null;
  @IsOptional() @IsString() buddyUserId?: string | null;
  @IsOptional() @IsString() startDate?: string;
}
export class OnbItemDto {
  @Type(() => Number) @IsInt() idx!: number;
  @IsOptional() @IsString() @MaxLength(500) override?: string;
}
export class TextDto {
  @IsOptional() @IsString() @MaxLength(4000) text?: string;
}

export class OfbDto {
  @IsString() userId!: string;
  @IsString() exitType!: string;
  @IsString() @MaxLength(500) reason!: string;
  @IsString() lastDay!: string;
  @IsOptional() @IsString() noticeDate?: string;
  @IsOptional() @IsString() handoverUserId?: string;
}

export class CycleDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() start!: string;
  @IsString() end!: string;
  @IsOptional() scale?: number | string;
}
export class CycleActDto {
  @IsIn(['close', 'add']) act!: 'close' | 'add';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  ids?: string[];
}
export class ReviewActDto {
  @IsString() act!: string;
  @IsOptional() @IsString() @MaxLength(8000) txt?: string;
  @IsOptional() @IsString() rating?: string;
  @IsOptional() @IsString() @MaxLength(500) dev?: string;
  @IsOptional() @IsString() @MaxLength(200) goal?: string;
  @IsOptional() weight?: number | string;
  @IsOptional() idx?: number | string;
  @IsOptional() p?: number | string;
}

export class CourseDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(120) provider?: string;
  @IsString() type!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  roles?: string[];
  @IsOptional() hours?: number | string;
  @IsOptional() @IsString() mode?: string;
  @IsOptional() assessment?: boolean | string;
  @IsOptional() @IsString() @MaxLength(80) skill?: string;
  @IsOptional() validDays?: number | string | null;
}
export class AssignTrDto {
  @IsString() courseId!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  ids?: string[];
  @IsOptional() @IsBoolean() byDept?: boolean;
  @IsOptional() @IsNumber() dueDays?: number;
}

export class PpSettingsDto {
  @IsString() section!: string;
  @IsObject() values!: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsInt() expectedVersion?: number;
}
