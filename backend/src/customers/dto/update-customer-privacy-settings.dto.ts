import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCustomerPrivacySettingsDto {
  @IsOptional()
  @IsBoolean()
  creditBalanceVisibleToStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  notesVisibleToStaff?: boolean;

  @IsOptional()
  @IsBoolean()
  staffCanExport?: boolean;

  @IsOptional()
  @IsBoolean()
  staffCanMerge?: boolean;

  @IsOptional()
  @IsBoolean()
  staffCanArchive?: boolean;
}
