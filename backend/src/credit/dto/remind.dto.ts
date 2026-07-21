import { IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator';

export class RemindDto {
  @ValidateIf((o: RemindDto) => !o.all)
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
