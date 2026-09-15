import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeclineQuotationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
