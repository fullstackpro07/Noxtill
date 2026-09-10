import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @IsIn(['picked_up', 'en_route', 'delivered', 'failed'])
  status!: 'picked_up' | 'en_route' | 'delivered' | 'failed';

  /** All Deliveries depth fix (UPD-FE-055e) — required by the service when `status = failed`. */
  @IsOptional()
  @IsString()
  failureReason?: string;
}
