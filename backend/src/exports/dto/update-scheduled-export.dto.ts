import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { EXPORT_FORMATS } from '../exports.constants';

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
}
