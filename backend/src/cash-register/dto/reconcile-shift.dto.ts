import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ReconcileShiftDto {
  @IsNumber()
  @Min(0)
  countedCash!: number;

  /** Required only once the variance exceeds VARIANCE_NOTE_THRESHOLD — enforced in the service. */
  @IsOptional()
  @IsString()
  note?: string;
}
