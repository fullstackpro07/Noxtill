import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Min,
} from 'class-validator';
import { CONFLICT_RESOLUTIONS } from '../listings.constants';

export class UpdateListingSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoSyncEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  autoSyncFrequencyHours?: number;

  /** `{ [provider]: string[] }` — MasterListingData field keys to exclude when pushing to that provider. */
  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, string[]>;

  @IsOptional()
  @IsIn(CONFLICT_RESOLUTIONS)
  conflictResolution?: (typeof CONFLICT_RESOLUTIONS)[number];
}
