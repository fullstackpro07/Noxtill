import { IsObject, IsOptional, IsString } from 'class-validator';

export class TestMessageDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  templateKey!: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
