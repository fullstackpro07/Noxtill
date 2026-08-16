import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class QueryAppointmentsDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  staff?: string;

  /** UPD-BE-020 — e.g. `GET /appointments?status=no_show`. */
  @IsOptional()
  @IsIn([
    'requested',
    'booked',
    'confirmed',
    'completed',
    'no_show',
    'cancelled',
  ])
  status?:
    | 'requested'
    | 'booked'
    | 'confirmed'
    | 'completed'
    | 'no_show'
    | 'cancelled';
}
