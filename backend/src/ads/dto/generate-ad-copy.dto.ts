import { IsOptional, IsString } from 'class-validator';

export class GenerateAdCopyDto {
  @IsString()
  productName!: string;

  @IsOptional()
  @IsString()
  goal?: string;
}
