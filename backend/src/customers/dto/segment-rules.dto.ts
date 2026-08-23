import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDefined, IsIn, ValidateNested } from 'class-validator';
import { SEGMENT_FIELDS, SEGMENT_OPERATORS } from '../segment-rules.util';

export class SegmentConditionDto {
  @IsIn(SEGMENT_FIELDS)
  field!: (typeof SEGMENT_FIELDS)[number];

  @IsIn(SEGMENT_OPERATORS)
  operator!: (typeof SEGMENT_OPERATORS)[number];

  /** Deliberately untyped beyond IsDefined — value's real type (string/number/boolean) depends on `field`. */
  @IsDefined()
  value!: string | number | boolean;
}

export class SegmentRulesDto {
  @IsIn(['AND', 'OR'])
  combinator!: 'AND' | 'OR';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SegmentConditionDto)
  conditions!: SegmentConditionDto[];
}
