import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateOptionSetDto {
  @IsString()
  setKey!: string;

  @IsString()
  label!: string;
}

export class CreateOptionDto {
  @IsString()
  value!: string;
}

export class UpdateOptionDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}

export class ReorderOptionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedIds!: string[];
}
