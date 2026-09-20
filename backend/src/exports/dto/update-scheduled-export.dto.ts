import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { EXPORT_FORMATS } from '../exports.constants';
import { ScheduleRecipientDto } from './create-scheduled-export.dto';

const FREQUENCIES = ['weekly', 'monthly'] as const;

export class UpdateScheduledExportDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsIn(FREQUENCIES)
  frequency?: (typeof FREQUENCIES)[number];

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

  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format?: (typeof EXPORT_FORMATS)[number];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleRecipientDto)
  recipients?: ScheduleRecipientDto[];
}
