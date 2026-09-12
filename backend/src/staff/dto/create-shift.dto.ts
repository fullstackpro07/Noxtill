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

  /** A specific shift already belonging to `coveringUserId` that they'll trade back — makes this
   * a real reciprocal swap instead of a one-way handoff. Omit for a plain coverage request. */
  @IsOptional()
  @IsString()
  swapWithShiftId?: string;
}
