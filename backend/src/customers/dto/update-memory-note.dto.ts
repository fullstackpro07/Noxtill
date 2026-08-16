import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateMemoryNoteDto {
  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
