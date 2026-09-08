import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { LISTING_PHOTO_CATEGORIES } from '../listings.constants';

export class CreateListingPhotoDto {
  @IsString()
  url!: string;

  @IsIn(LISTING_PHOTO_CATEGORIES)
  category!: (typeof LISTING_PHOTO_CATEGORIES)[number];
}

export class UpdateListingPhotoDto {
  @IsOptional()
  @IsIn(LISTING_PHOTO_CATEGORIES)
  category?: (typeof LISTING_PHOTO_CATEGORIES)[number];
}

export class PushListingPhotoDto {
  /** Omit to push to every connected directory whose connector supports photo push. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  providers?: string[];
}
