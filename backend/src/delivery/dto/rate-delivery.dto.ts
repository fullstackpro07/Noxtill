import { IsInt, Max, Min } from 'class-validator';

/** Riders screen depth fix (UPD-FE-127) — real, staff-recorded 1-5 delivery-quality rating. */
export class RateDeliveryDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}
