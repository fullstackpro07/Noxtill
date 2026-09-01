import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
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

  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format?: (typeof EXPORT_FORMATS)[number];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleRecipientDto)
  recipients?: ScheduleRecipientDto[];
}
