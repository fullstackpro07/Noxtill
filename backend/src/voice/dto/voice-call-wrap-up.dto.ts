import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { VoiceCallWrapUpDisposition } from '@prisma/client';

export class SubmitVoiceCallWrapUpDto {
  @IsEnum(VoiceCallWrapUpDisposition)
  disposition!: VoiceCallWrapUpDisposition;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
