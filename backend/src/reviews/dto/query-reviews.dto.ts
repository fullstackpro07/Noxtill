import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryReviewsDto {
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  rating?: string;

  @IsOptional()
  @IsIn(['open', 'assigned', 'resolved'])
  status?: 'open' | 'assigned' | 'resolved';
}
