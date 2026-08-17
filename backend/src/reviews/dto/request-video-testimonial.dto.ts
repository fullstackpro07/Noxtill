import { IsOptional, IsString } from 'class-validator';

export class RequestVideoTestimonialDto {
  @IsString()
  customerId!: string;

  /** Optional prompt shown to the customer, e.g. "Tell us about your experience with X". */
  @IsOptional()
  @IsString()
  caption?: string;
}
