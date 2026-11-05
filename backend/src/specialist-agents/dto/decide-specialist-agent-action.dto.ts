import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class DecideSpecialistAgentActionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedPayloadHash?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedCountsHash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
