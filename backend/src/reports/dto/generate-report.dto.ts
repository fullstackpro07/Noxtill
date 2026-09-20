import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class GenerateReportDto {
  /** YYYY-MM; defaults to the current calendar month when omitted. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month?: string;

  /** `ai_builder` marks a run the owner confirmed from the AI report builder. */
  @IsOptional()
  @IsIn(['manual', 'ai_builder'])
  trigger?: 'manual' | 'ai_builder';
}

export class SendReportDto {
  /** Omit both to send to yourself. Sending to anyone else is owner-only. */
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class AiBuilderDto {
  @IsString()
  @MinLength(3)
  request!: string;
}

export class RecordFilingDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'period must be in YYYY-MM format' })
  period!: string;

  @IsString()
  filedOn!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TaxReminderDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'period must be in YYYY-MM format' })
  period!: string;
}

export class TaxSettingsDto {
  @IsInt()
  @Min(1)
  @Max(28)
  filingDay!: number;
}
