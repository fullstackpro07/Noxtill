import { IsEnum, IsOptional } from 'class-validator';
import { CustomerMatchOn, CustomerConflictResolution } from '@prisma/client';

export class UpdateCustomerMergeSettingsDto {
  @IsOptional()
  @IsEnum(CustomerMatchOn)
  matchOn?: CustomerMatchOn;

  @IsOptional()
  @IsEnum(CustomerConflictResolution)
  conflictResolution?: CustomerConflictResolution;
}
