import { IsObject, IsOptional, IsString } from 'class-validator';

/** Shape a lead-gen form webhook payload is normalized into before reaching the service — field names vary per real provider, mapping that is each webhook handler's own job. */
export class IngestAdLeadDto {
  @IsString()
  externalId!: string;

  @IsOptional()
  @IsString()
  campaignExternalId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsObject()
  formData?: Record<string, unknown>;
}
