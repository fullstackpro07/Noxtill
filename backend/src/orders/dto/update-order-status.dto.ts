import { IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
  status!: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
}
