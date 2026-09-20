import { IsISO8601, IsString, MinLength } from 'class-validator';

export class ManualAttendanceDto {
  @IsString()
  staffUserId!: string;

  @IsISO8601()
  checkIn!: string;

  @IsISO8601()
  checkOut!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
