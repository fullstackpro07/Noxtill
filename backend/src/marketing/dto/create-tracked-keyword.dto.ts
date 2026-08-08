import { IsString, MinLength } from 'class-validator';

export class CreateTrackedKeywordDto {
  @IsString()
  @MinLength(2)
  keyword!: string;
}
