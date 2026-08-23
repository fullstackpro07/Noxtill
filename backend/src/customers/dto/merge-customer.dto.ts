import { IsString } from 'class-validator';

export class MergeCustomerDto {
  /** The duplicate record — its history moves onto the customer this is called on (the canonical one), then it's deleted. */
  @IsString()
  duplicateCustomerId!: string;
}
