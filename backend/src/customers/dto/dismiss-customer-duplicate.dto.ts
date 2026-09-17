import { IsString } from 'class-validator';

export class DismissCustomerDuplicateDto {
  @IsString()
  customerIdA!: string;

  @IsString()
  customerIdB!: string;
}
