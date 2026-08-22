import { IsIn } from 'class-validator';
import { EXPORT_FORMATS, EXPORT_KINDS } from '../exports.constants';

const FREQUENCIES = ['weekly', 'monthly'] as const;

export class CreateScheduledExportDto {
  @IsIn(EXPORT_KINDS)
  kind!: (typeof EXPORT_KINDS)[number];

  @IsIn(EXPORT_FORMATS)
  format!: (typeof EXPORT_FORMATS)[number];

  @IsIn(FREQUENCIES)
  frequency!: (typeof FREQUENCIES)[number];
}
