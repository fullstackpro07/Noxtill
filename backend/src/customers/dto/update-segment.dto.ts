import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { SegmentRulesDto } from './segment-rules.dto';

export class UpdateSegmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentRulesDto)
  rules?: SegmentRulesDto;
}
