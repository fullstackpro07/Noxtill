import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateWalkInAppointmentDto {
  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsISO8601()
  startsAt!: string;

  @IsString()
  customerName!: string;

  @IsString()
  customerPhone!: string;

  /** Services, formal fields depth fix (UPD-INT-004) — required (and captured immediately, cash only) when the service's own `depositRequired` is set. The customer is physically present, so cash is collected in the same session. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;
}
