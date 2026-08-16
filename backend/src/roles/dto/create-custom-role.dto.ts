import { ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';

export class CreateCustomRoleDto {
  @IsString()
  name!: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  capabilities!: string[];
}

export class UpdateCustomRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  capabilities?: string[];
}
