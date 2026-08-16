import { IsOptional, IsString } from 'class-validator';

export class JoinQueueDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;
}
