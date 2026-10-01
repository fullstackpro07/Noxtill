import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CommerceStoreOpportunityStatus } from '@prisma/client';

export class SetCommerceStoreOpportunityStatusDto {
  @IsEnum(CommerceStoreOpportunityStatus)
  status!: CommerceStoreOpportunityStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
