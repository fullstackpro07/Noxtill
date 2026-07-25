import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

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
}
