import { IsOptional, IsString } from 'class-validator';

/**
 * Multipart form fields arrive as raw strings — `mapping`/`skippedRows`/`corrections` are each a
 * JSON-encoded string the frontend sends alongside the file, parsed in `ProductsImportService`.
 */
export class CommitImportDto {
  /** JSON-encoded `Record<fileColumnName, canonicalFieldOrIgnore>`. */
  @IsString()
  mapping!: string;

  /** JSON-encoded `number[]` of 1-based row numbers to skip entirely. */
  @IsOptional()
  @IsString()
  skippedRows?: string;

  /** JSON-encoded `{ rowNumber: number; data: Record<string,string> }[]` — hand-corrected raw values, keyed by file column name, applied before mapping. */
  @IsOptional()
  @IsString()
  corrections?: string;
}
