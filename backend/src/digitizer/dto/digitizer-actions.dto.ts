import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SCANNER_TYPES } from '../digitizer.constants';
import type {
  DocumentTotals,
  LedgerData,
  LineItem,
  ScannerType,
} from '../digitizer.types';

export class ReprocessDocumentDto {
  /** Re-run extraction as a different document type. Omit to read it again as the same type. */
  @IsOptional()
  @IsIn(SCANNER_TYPES)
  scannerType?: ScannerType;
}

export class ApproveDocumentsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];
}

/** The figures behind a reconciliation — line items, printed totals, ledger entries — corrected by hand. */
export class UpdateTableDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  lineItems?: LineItem[];

  @IsOptional()
  @IsObject()
  totals?: Partial<DocumentTotals>;

  @IsOptional()
  @IsObject()
  ledger?: Partial<LedgerData>;
}

export class AskAssistantDto {
  @IsOptional()
  @IsIn(['review', 'duplicates', 'total', 'extract', 'summary'])
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  question?: string;
}

export class UpdateDigitizerSettingDto {
  @IsString()
  @MaxLength(80)
  key!: string;

  /** Boolean for a toggle, a number for a threshold — validated against the policy's own definition. */
  @IsDefined()
  value!: unknown;
}
