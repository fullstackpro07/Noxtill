import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateTimeOffDto {
  /** Owner/manager may create on behalf of a staff member; omitted means "for myself". */
  @IsOptional()
  @IsString()
  staffUserId?: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
