import { IsOptional, IsString } from 'class-validator';

export class UpdateCompetitorDto {
  @IsOptional()
  @IsString()
  metaPageId?: string;
}
