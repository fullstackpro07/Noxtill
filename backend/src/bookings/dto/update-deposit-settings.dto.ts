import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateDepositSettingsDto {
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  triggerAfterNoShows?: number | null;

  @IsOptional()
  @IsIn(['flat', 'percent'])
  amountType?: 'flat' | 'percent';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountValue?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableServiceIds?: string[];
}
