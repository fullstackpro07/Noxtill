import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateDsrRequestDto {
  @IsString()
  customerId!: string;

  @IsIn(['export', 'erasure'])
  kind!: 'export' | 'erasure';

  @IsOptional()
  @IsString()
  note?: string;
}
