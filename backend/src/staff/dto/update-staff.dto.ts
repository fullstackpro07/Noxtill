import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateStaffDto {
  @IsOptional()
  @IsIn(['manager', 'staff'])
  role?: 'manager' | 'staff';

  @IsOptional()
  @IsObject()
  commissionRule?: Record<string, unknown>;

  /** UPD-BE-035 — assigns a business-defined custom role; `null` clears it back to the system role default. */
  @IsOptional()
  @IsString()
  customRoleId?: string | null;

  /** Staff depth fix (UPD-INT-011): `null` clears it back to purely-commission. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number | null;
}
