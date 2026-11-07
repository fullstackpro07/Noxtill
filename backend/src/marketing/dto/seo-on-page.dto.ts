import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateSeoRevisionDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  pageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  proposedTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  proposedMetaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  proposedH1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  primaryKeyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rationale?: string;
}

export class EditSeoRevisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  proposedTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  proposedMetaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  proposedH1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  primaryKeyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rationale?: string;
}

export class SuggestSeoRevisionDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  pageUrl!: string;
}

export class TransitionSeoRevisionDto {
  @IsIn(['approval_required', 'approved', 'rejected', 'applied'])
  status!: 'approval_required' | 'approved' | 'rejected' | 'applied';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
