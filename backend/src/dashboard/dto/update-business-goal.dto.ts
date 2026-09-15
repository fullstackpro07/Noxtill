import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateBusinessGoalDto {
  @IsNumber()
  @Min(0)
  dailyRevenueTarget!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyOrdersTarget?: number | null;
}
