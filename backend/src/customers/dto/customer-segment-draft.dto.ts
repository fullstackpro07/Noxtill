import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  Matches,
} from 'class-validator';
import { SegmentRulesDto } from './segment-rules.dto';

export class CustomerSegmentDraftVersionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class UpdateCustomerSegmentDraftDto extends CustomerSegmentDraftVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ValidateNested()
  @Type(() => SegmentRulesDto)
  rules!: SegmentRulesDto;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class RejectCustomerSegmentDraftDto extends CustomerSegmentDraftVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class SubmitCustomerSegmentDraftDto extends CustomerSegmentDraftVersionDto {
  @Matches(/^[a-f0-9]{64}$/)
  expectedPayloadHash!: string;
  @Matches(/^[a-f0-9]{64}$/)
  expectedCountsHash!: string;
}

export class ApproveCustomerSegmentDraftDto extends SubmitCustomerSegmentDraftDto {}
