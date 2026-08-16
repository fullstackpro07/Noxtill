import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class InstallmentLineDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsISO8601()
  dueDate!: string;
}

export class CreateInstallmentPlanDto {
  @IsNumber()
  @Min(0.01)
  totalAmount!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InstallmentLineDto)
  installments!: InstallmentLineDto[];

  @IsOptional()
  @IsString()
  note?: string;
}
