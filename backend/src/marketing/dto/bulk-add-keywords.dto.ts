import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

/** Bulk keyword import (UPD-BE-128). */
export class BulkAddKeywordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  keywords!: string[];
}
