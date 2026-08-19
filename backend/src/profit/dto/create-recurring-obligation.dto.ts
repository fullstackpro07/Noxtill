import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RecurringObligationFrequency } from '@prisma/client';

export class CreateRecurringObligationDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(Object.values(RecurringObligationFrequency))
  frequency!: RecurringObligationFrequency;

  @IsDateString()
  nextDueDate!: string;

  @IsOptional()
  @IsString()
  category?: string;
}
