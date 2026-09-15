import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
  status!: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

  /** Only meaningful (and stored) when `status` is `cancelled`. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
