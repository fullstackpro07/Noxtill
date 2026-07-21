import { IsOptional, IsString } from 'class-validator';

export class QueryCustomersDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  tag?: string;
}
