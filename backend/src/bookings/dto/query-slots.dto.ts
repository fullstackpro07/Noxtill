import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QuerySlotsDto {
  @IsString()
  service!: string;

  @IsOptional()
  @IsString()
  staff?: string;

  @IsDateString()
  date!: string;
}
