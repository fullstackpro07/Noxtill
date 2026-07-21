import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SubmitReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  @IsOptional()
  @IsString()
  message?: string;
}
