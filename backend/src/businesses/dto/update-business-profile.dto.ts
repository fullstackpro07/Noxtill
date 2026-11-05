import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateBusinessProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  country?: string;

  /** Public business email (the same field the Settings hub Business category edits). */
  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  /** Taxes & Currency (UPD-BE-120) — the flat default rate/label, never previously persistable by any endpoint. */
  @IsOptional()
  @IsString()
  @MaxLength(191)
  taxLabel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;
}
