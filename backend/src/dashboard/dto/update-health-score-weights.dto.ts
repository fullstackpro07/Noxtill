import { IsInt, Max, Min } from 'class-validator';

export class UpdateHealthScoreWeightsDto {
  @IsInt()
  @Min(0)
  @Max(100)
  ratingTrend!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  repeatCustomerRate!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  margin!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  creditRecovery!: number;
}
