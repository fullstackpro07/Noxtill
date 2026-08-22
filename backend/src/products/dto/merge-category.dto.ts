import { IsString } from 'class-validator';

export class MergeCategoryDto {
  /** The category this one's products move into — this category is then deleted. */
  @IsString()
  targetCategoryId!: string;
}
