import { IsArray, IsEnum, IsString } from 'class-validator';
import { CustomerExportFormat } from '@prisma/client';

export class ExportCustomersDto {
  @IsEnum(CustomerExportFormat)
  format!: CustomerExportFormat;

  /// Field keys from `CUSTOMER_EXPORT_FIELDS` — `credit` is silently dropped server-side for a
  /// Staff caller (see `CustomersExportService.generate`), never trusted from the request alone.
  @IsArray()
  @IsString({ each: true })
  fields!: string[];
}
