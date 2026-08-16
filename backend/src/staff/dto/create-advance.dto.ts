import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdvanceDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateAdvanceDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
