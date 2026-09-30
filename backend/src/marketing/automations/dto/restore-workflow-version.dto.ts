import {
  IsDateString,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RestoreWorkflowVersionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsDateString()
  expectedUpdatedAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
