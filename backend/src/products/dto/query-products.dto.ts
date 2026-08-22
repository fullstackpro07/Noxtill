import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryProductsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(['product', 'service'])
  kind?: 'product' | 'service';

  @IsOptional()
  @IsIn(['true', 'false'])
  active?: string;
}
