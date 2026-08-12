import { IsString } from 'class-validator';

export class MoveTableDto {
  /** The `number` of the destination table — must already exist and have no active order. */
  @IsString()
  toTableNumber!: string;
}
