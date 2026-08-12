import { IsString } from 'class-validator';

export class MergeTablesDto {
  /** The `number` of the table whose active order absorbs this table's items — must have its own active order. */
  @IsString()
  intoTableNumber!: string;
}
