import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdateSystemRoleCapabilitiesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  capabilities!: string[];
}
