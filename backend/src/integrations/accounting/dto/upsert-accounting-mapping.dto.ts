import { IsIn, IsOptional, IsString } from 'class-validator';
import { IntegrationProvider } from '@prisma/client';
import { ACCOUNTING_PROVIDERS } from '../accounting.constants';

export class UpsertAccountingMappingDto {
  @IsIn(ACCOUNTING_PROVIDERS)
  provider!: IntegrationProvider;

  /** NULL/omitted = the catch-all default mapping used when no category-specific row matches. */
  @IsOptional()
  @IsString()
  productCategory?: string;

  @IsString()
  externalAccountCode!: string;

  @IsOptional()
  @IsString()
  externalTaxCode?: string;
}
