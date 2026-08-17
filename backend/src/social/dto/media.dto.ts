import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class GenerateMediaImageDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateMediaAssetDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tags?: string[];
}

export const MEDIA_ASSET_TYPES = ['image', 'video'] as const;

export class MediaAssetTypeQueryDto {
  @IsOptional()
  @IsIn(MEDIA_ASSET_TYPES)
  type?: (typeof MEDIA_ASSET_TYPES)[number];
}
