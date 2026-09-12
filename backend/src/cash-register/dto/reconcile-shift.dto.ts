import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DenominationCountDto {
  @IsNumber()
  @Min(0)
  value!: number;

  @IsNumber()
  @Min(0)
  count!: number;
}

export class ReconcileShiftDto {
  @IsNumber()
  @Min(0)
  countedCash!: number;

  /** Required only once the variance exceeds VARIANCE_NOTE_THRESHOLD — enforced in the service. */
  @IsOptional()
  @IsString()
  note?: string;

  /** Shift Closing depth fix — the real denomination breakdown, persisted for later reprints. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DenominationCountDto)
  denominations?: DenominationCountDto[];
}
