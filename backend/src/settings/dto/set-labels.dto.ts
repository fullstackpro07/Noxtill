import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';

export class LabelUpdateDto {
  @IsString()
  area!: string;

  @IsString()
  key!: string;

  @IsString()
  value!: string;
}

export class SetLabelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LabelUpdateDto)
  updates!: LabelUpdateDto[];
}
