import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CategoryOrderEntryDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CategoryOrderEntryDto)
  categories!: CategoryOrderEntryDto[];
}
