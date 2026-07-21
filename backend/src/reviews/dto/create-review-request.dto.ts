import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateReviewRequestDto {
  @ValidateIf((o: CreateReviewRequestDto) => !o.phone)
  @IsString()
  customerId?: string;

  @ValidateIf((o: CreateReviewRequestDto) => !o.customerId)
  @IsString()
  phone?: string;

  @IsString()
  source!: string;

  @IsOptional()
  @IsString()
  sourceId?: string;
}
