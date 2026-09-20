import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { EXPORT_FORMATS, EXPORT_KINDS } from '../exports.constants';
import { REPORT_KINDS } from '../../reports/reports.types';

const FREQUENCIES = ['weekly', 'monthly'] as const;

export class ScheduleRecipientDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

/** Exactly one of `kind` (a raw data export) / `reportKind` (a real PDF report) must be set —
 * validated in `ScheduledExportsService.create()`, not here, since class-validator has no clean
 * "exactly one of these two fields" built-in. */
export class CreateScheduledExportDto {
  @IsOptional()
  @IsIn(EXPORT_KINDS)
  kind?: (typeof EXPORT_KINDS)[number];

  @IsOptional()
  @IsIn(REPORT_KINDS)
  reportKind?: (typeof REPORT_KINDS)[number];

  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format?: (typeof EXPORT_FORMATS)[number];

  @IsIn(FREQUENCIES)
  frequency!: (typeof FREQUENCIES)[number];

  /** Weekly schedules: 0 (Sunday) to 6 (Saturday). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  /** Monthly schedules: 1 to 28, so every month has the day. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  /** Real WhatsApp/email recipients — omitted or empty keeps the original in-app-notify-the-creator behavior. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleRecipientDto)
  recipients?: ScheduleRecipientDto[];
}
