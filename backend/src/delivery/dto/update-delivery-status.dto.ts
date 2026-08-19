import { IsIn } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @IsIn(['picked_up', 'en_route', 'delivered', 'failed'])
  status!: 'picked_up' | 'en_route' | 'delivered' | 'failed';
}
