import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class IssueVoucherDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsNumber()
  @Min(0.01)
  value!: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
