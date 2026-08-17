import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateShiftDto {
  @IsString()
  staffUserId!: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateShiftDto {
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsIn(['scheduled', 'completed', 'cancelled'])
  status?: 'scheduled' | 'completed' | 'cancelled';

  @IsOptional()
  @IsString()
  note?: string;
}

export class RequestShiftSwapDto {
  @IsOptional()
  @IsString()
  coveringUserId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
