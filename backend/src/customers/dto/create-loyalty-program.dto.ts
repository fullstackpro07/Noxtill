import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class LoyaltyTierDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  minSpend!: number;
}

export class CreateLoyaltyProgramDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(['punch_card', 'tier'])
  type?: 'punch_card' | 'tier';

  @IsOptional()
  @IsInt()
  @Min(1)
  stampsRequired?: number;

  @IsOptional()
  @IsString()
  rewardDescription?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoyaltyTierDto)
  tiers?: LoyaltyTierDto[];
}
