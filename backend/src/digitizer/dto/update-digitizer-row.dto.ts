import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';
import { DESTINATIONS } from '../digitizer.constants';
import type {
  DigitizerDestination,
  DigitizerRowData,
  DuplicateDecision,
} from '../digitizer.types';

export class UpdateDigitizerRowDto {
  @IsOptional()
  @IsObject()
  data?: DigitizerRowData;

  @IsOptional()
  @IsIn(DESTINATIONS)
  destination?: DigitizerDestination;

  @IsOptional()
  @IsIn(['commit', 'skip'])
  action?: 'commit' | 'skip';

  /** The owner looked at this row and accepts it as it stands. */
  @IsOptional()
  @IsBoolean()
  reviewed?: boolean;

  /** `null` clears an earlier decision. */
  @IsOptional()
  @IsIn(['use_existing', 'create_new', null])
  duplicateDecision?: DuplicateDecision | null;
}
