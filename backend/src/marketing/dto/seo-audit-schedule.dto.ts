import { IsBoolean, IsIn, IsInt } from 'class-validator';

export class SeoAuditScheduleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @IsIn([24, 168, 720])
  intervalHours!: 24 | 168 | 720;
}
