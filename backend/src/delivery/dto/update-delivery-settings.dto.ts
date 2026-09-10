import { IsInt, Max, Min } from 'class-validator';

export class UpdateDeliverySettingsDto {
  @IsInt()
  @Min(5)
  @Max(1440)
  defaultSlaMinutes!: number;
}
