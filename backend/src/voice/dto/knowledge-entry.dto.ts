import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { VoiceKnowledgeKind } from '@prisma/client';

const KINDS: VoiceKnowledgeKind[] = ['faq', 'document'];

export class CreateKnowledgeEntryDto {
  @IsIn(KINDS)
  kind!: VoiceKnowledgeKind;

  @IsString()
  @MaxLength(160)
  title!: string;

  /** The question callers ask, for an FAQ entry. Ignored for a document. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  question?: string;

  @IsString()
  @MaxLength(50_000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceFilename?: string;
}

export class UpdateKnowledgeEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  question?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  content?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
