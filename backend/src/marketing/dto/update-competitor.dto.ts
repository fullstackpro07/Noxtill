import { IsOptional, IsString } from 'class-validator';

export class UpdateCompetitorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  metaPageId?: string;
}
