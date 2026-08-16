import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateWaitlistEntryDto {
  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsString()
  customerName!: string;

  @IsString()
  customerPhone!: string;

  @IsOptional()
  @IsISO8601()
  preferredFrom?: string;

  @IsOptional()
  @IsISO8601()
  preferredTo?: string;
}
