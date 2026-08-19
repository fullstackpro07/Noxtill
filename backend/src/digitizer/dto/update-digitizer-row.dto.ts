import { IsIn, IsObject, IsOptional } from 'class-validator';
import { DESTINATIONS } from '../digitizer.constants';
import type {
  DigitizerDestination,
  DigitizerRowData,
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
}
