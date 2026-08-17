import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { SocialPlatform } from '../../../generated/prisma';

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
