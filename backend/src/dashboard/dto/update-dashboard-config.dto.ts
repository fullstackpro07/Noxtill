import { IsObject } from 'class-validator';

export class UpdateDashboardConfigDto {
  @IsObject()
  config!: Record<string, unknown>;
}
