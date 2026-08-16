import { IsOptional, IsString } from 'class-validator';

export class RejectVideoTestimonialDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
