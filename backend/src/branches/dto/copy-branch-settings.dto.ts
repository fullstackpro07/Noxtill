import { IsString } from 'class-validator';

export class CopyBranchSettingsDto {
  @IsString()
  fromBranchId!: string;
}
