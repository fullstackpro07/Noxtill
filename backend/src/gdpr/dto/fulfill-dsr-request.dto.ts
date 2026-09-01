import { IsOptional, IsString } from 'class-validator';

/** `confirmPhone` is required only for an `erasure` kind — `CustomersService.erase()` already enforces that; validated there, not duplicated here. */
export class FulfillDsrRequestDto {
  @IsOptional()
  @IsString()
  confirmPhone?: string;
}

export class RejectDsrRequestDto {
  @IsOptional()
  @IsString()
  note?: string;
}
