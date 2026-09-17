import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { CustomerStatus } from '@prisma/client';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  consentMarketing?: boolean;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  /// Customer Settings (UPD-BE-101) — real status, gated to Staff via `staffCanArchive` (only
  /// `active` is ever settable by Staff regardless of the toggle; see `CustomersService.update`).
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  /// Customer Settings (UPD-BE-101) — keyed by `CustomerCustomField.name`.
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, string | number | null>;
}
