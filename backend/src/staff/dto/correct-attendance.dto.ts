import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class CorrectAttendanceDto {
  @IsISO8601()
  checkIn!: string;

  @IsOptional()
  @IsISO8601()
  checkOut?: string;

  @IsString()
  @MinLength(1)
  note!: string;
}
