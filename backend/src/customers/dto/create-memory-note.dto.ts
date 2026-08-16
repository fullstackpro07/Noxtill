import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { MEMORY_NOTE_SUBJECT_TYPES } from '../memory-notes.constants';

export class CreateMemoryNoteDto {
  @IsIn(MEMORY_NOTE_SUBJECT_TYPES)
  subjectType!: 'customer' | 'supplier' | 'product' | 'table';

  @IsString()
  subjectId!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
