import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VoiceQualityCriterionDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  weight!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  guidance!: string;
}

export class SaveVoiceQualityRubricDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => VoiceQualityCriterionDto)
  criteria!: VoiceQualityCriterionDto[];
}

export class VoiceQualityScoreDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  criterionKey!: string;

  @IsInt()
  @Min(0)
  @Max(5)
  score!: number;

  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(0, { each: true })
  evidenceTurnIndexes!: number[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SaveVoiceQualityReviewDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => VoiceQualityScoreDto)
  scores!: VoiceQualityScoreDto[];
}

export class OverrideVoiceQualityReviewDto {
  @IsInt()
  @Min(0)
  @Max(100)
  score!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  reason!: string;
}

export class AssignVoiceQualityReviewDto {
  @ValidateIf(
    (value: AssignVoiceQualityReviewDto) => value.assignedToUserId !== null,
  )
  @IsString()
  assignedToUserId!: string | null;
}
