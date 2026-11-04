import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResolveInventoryWastageReviewTaskDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  note!: string;
}
