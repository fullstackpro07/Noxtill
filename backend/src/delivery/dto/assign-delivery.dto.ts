import { IsString } from 'class-validator';

export class AssignDeliveryDto {
  @IsString()
  riderId!: string;
}
