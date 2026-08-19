import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAdCreativeDto {
  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  mediaKey?: string;

  @IsOptional()
  @IsIn(['draft', 'approved', 'active', 'paused'])
  status?: string;
}
