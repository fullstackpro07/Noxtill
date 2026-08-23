import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
import { SegmentRulesDto } from './segment-rules.dto';

export class CreateSegmentDto {
  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => SegmentRulesDto)
  rules!: SegmentRulesDto;
}
