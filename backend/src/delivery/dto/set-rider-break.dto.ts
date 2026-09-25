import { IsBoolean } from 'class-validator';

export class SetRiderBreakDto {
  @IsBoolean()
  onBreak!: boolean;
}
