import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';
import {
  ALL_CAPABILITIES,
  Capability,
} from '../../common/capabilities/capabilities.constants';

export class CreateApiKeyDto {
  @IsString()
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ALL_CAPABILITIES, { each: true })
  scopes!: Capability[];
}
