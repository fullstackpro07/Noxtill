import { IsOptional, IsString } from 'class-validator';

/** Per-zone SLA depth fix — `zoneId: null` clears the zone, reverting the delivery to the business default SLA. */
export class AssignDeliveryZoneDto {
  @IsOptional()
  @IsString()
  zoneId?: string | null;
}
