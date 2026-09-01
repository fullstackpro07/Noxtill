import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { ADD_ON_KEYS } from '../billing.constants';

export class UpdateAddOnsDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(ADD_ON_KEYS, { each: true })
  keys!: string[];
}
