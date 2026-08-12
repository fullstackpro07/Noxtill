import { IsInt, Min } from 'class-validator';

export class SplitBillDto {
  @IsInt()
  @Min(2)
  parts!: number;
}
