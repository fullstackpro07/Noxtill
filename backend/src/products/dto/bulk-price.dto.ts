import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class BulkPriceDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsString()
  category?: string;

  @IsIn(['percent', 'amount'])
  mode!: 'percent' | 'amount';

  /** Signed — e.g. 10 raises by 10%/10, -5 lowers by 5%/5. */
  @IsNumber()
  value!: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
