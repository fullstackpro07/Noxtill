import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { SalePaymentDto } from './create-sale.dto';

export class ResumeHeldSaleDto {
  @ValidateNested()
  @Type(() => SalePaymentDto)
  payment!: SalePaymentDto;
}
