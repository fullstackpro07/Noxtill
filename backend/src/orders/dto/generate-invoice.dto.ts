import { IsBoolean, IsOptional } from 'class-validator';

export class GenerateInvoiceDto {
  @IsOptional()
  @IsBoolean()
  send?: boolean;
}
