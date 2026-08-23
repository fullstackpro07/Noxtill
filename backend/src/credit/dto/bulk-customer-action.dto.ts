import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class BulkCustomerActionDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  customerIds!: string[];

  /** Overdue screen's escalation-tone picker (UPD-FE-077) — only meaningful for bulk-remind. */
  @IsOptional()
  @IsIn(['gentle', 'firm', 'final'])
  tone?: 'gentle' | 'firm' | 'final';
}
