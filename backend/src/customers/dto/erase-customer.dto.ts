import { IsString } from 'class-validator';

export class EraseCustomerDto {
  /** Must exactly match the customer's current phone number — the typed confirmation. */
  @IsString()
  confirm!: string;
}
