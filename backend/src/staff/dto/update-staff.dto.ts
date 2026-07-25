import { IsIn, IsObject, IsOptional } from 'class-validator';

export class UpdateStaffDto {
  @IsOptional()
  @IsIn(['manager', 'staff'])
  role?: 'manager' | 'staff';

  @IsOptional()
  @IsObject()
  commissionRule?: Record<string, unknown>;
}
