import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateStaffDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsIn(['manager', 'staff'])
  role!: 'manager' | 'staff';

  /** e.g. `{"type":"percent","value":5}` or `{"type":"per_service","amounts":{...}}` — shape is owner-defined. */
  @IsOptional()
  @IsObject()
  commissionRule?: Record<string, unknown>;

  /** Staff depth fix (UPD-INT-011): a base hourly wage, separate from and additive to
   * `commissionRule` — omit for a purely-commission staff member. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
}
