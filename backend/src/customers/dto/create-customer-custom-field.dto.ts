import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { CustomerCustomFieldType } from '@prisma/client';

export class CreateCustomerCustomFieldDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(CustomerCustomFieldType)
  type?: CustomerCustomFieldType;

  /// Option labels — only meaningful when `type: select`.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}
