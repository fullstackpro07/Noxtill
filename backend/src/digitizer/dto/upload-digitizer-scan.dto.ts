import { IsIn } from 'class-validator';
import { SCANNER_TYPES } from '../digitizer.constants';
import type { ScannerType } from '../digitizer.types';

export class UploadDigitizerScanDto {
  @IsIn(SCANNER_TYPES)
  scannerType!: ScannerType;
}
