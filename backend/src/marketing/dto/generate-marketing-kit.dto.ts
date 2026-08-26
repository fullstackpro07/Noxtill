import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  MARKETING_ASSET_CONTENT_BLOCKS,
  MARKETING_ASSET_FORMATS,
  MARKETING_ASSET_TEMPLATES,
  type MarketingAssetContentBlock,
  type MarketingAssetFormat,
  type MarketingAssetTemplate,
} from '../marketing-assets.constants';

export class GenerateMarketingKitDto {
  @IsIn(MARKETING_ASSET_FORMATS)
  format!: MarketingAssetFormat;

  @IsIn(MARKETING_ASSET_TEMPLATES)
  template!: MarketingAssetTemplate;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(MARKETING_ASSET_CONTENT_BLOCKS, { each: true })
  contentBlocks!: MarketingAssetContentBlock[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tagline?: string;

  @IsOptional()
  @IsIn(['png', 'pdf'])
  fileType?: 'png' | 'pdf';

  /** From a prior `POST /marketing/kit/background` upload — omit to use the template's own background. */
  @IsOptional()
  @IsString()
  backgroundKey?: string;
}
