import { IsString, MaxLength, MinLength } from 'class-validator';

export class SeoAuditIssueReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
