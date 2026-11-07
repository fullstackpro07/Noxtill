import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideWorkflowApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
