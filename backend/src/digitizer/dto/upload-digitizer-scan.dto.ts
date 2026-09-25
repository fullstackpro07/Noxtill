import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SCANNER_TYPES } from '../digitizer.constants';
import type { ScannerType } from '../digitizer.types';

export class UploadDigitizerScanDto {
  @IsIn(SCANNER_TYPES)
  scannerType!: ScannerType;

  /** Ties together the files of one upload session — what the Batch screen groups by. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  groupId?: string;
}
