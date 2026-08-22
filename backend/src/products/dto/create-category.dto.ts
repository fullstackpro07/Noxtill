import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
