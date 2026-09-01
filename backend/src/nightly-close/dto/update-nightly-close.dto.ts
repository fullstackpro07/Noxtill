import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import {
  NIGHTLY_CLOSE_SECTIONS,
  NIGHTLY_CLOSE_VOICE_OPTIONS,
} from '../nightly-close-sections.constants';

const VOICE_IDS = NIGHTLY_CLOSE_VOICE_OPTIONS.map((v) => v.id);

export class NightlyCloseCustomLineDto {
  @IsString()
  label!: string;

  @IsString()
  value!: string;
}

export class UpdateNightlyCloseDto {
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'time must be in HH:mm 24h format',
  })
  time?: string;

  @IsOptional()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel?: 'whatsapp' | 'sms' | 'email';

  /** A full, reordered list of the same real sections — a subset omits (hides) the rest. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(NIGHTLY_CLOSE_SECTIONS, { each: true })
  sections?: (typeof NIGHTLY_CLOSE_SECTIONS)[number][];

  @IsOptional()
  @IsBoolean()
  voiceNoteEnabled?: boolean;

  @IsOptional()
  @IsIn(VOICE_IDS)
  voiceId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NightlyCloseCustomLineDto)
  customLines?: NightlyCloseCustomLineDto[];
}
