import { IsArray, IsString, MinLength } from 'class-validator';

export class GenerateReportDto {
  @IsString()
  @MinLength(1)
  question!: string;

  @IsString()
  answer!: string;

  /** Echoed straight from the same `toolCalls[]`/`helpSources[]` the chat turn already returned —
   * not re-derived here, so the report can never show a source the answer didn't actually use. */
  @IsArray()
  toolCalls!: { name: string; input: unknown; output: unknown }[];

  @IsArray()
  helpSources!: { title: string; url: string }[];
}
