import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SocialPlatform } from '@prisma/client';

export class CreateSocialPostDto {
  @IsString()
  caption!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaKeys?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(SocialPlatform, { each: true })
  platforms!: SocialPlatform[];

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

/**
 * Draft editing fix — only ever applied to a post while it's still `draft` (see
 * `SocialPostsService.update()`). All fields optional since a caller may only want to change one
 * thing (e.g. just the platform list).
 */
export class UpdateSocialPostDto {
  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(SocialPlatform, { each: true })
  platforms?: SocialPlatform[];

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

/** Published Posts, "Boost as ad" handoff (UPD-BE-127). */
export class BoostPostDto {
  @IsString()
  goal!: string;

  @IsNumber()
  @Min(1)
  dailyBudget!: number;
}
