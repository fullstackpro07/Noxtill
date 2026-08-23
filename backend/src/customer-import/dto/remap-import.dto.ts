import { IsObject } from 'class-validator';

export class RemapImportDto {
  /** `{fileColumnName: canonicalFieldOrIgnore}`. */
  @IsObject()
  mapping!: Record<string, string>;
}
