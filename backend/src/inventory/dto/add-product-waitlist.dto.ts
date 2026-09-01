import { IsString } from 'class-validator';

export class AddProductWaitlistDto {
  @IsString()
  customerId!: string;
}
