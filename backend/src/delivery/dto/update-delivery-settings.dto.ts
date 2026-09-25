import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateDeliverySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  defaultSlaMinutes?: number;

  /** Real buffer added on top of the SLA when promising a customer a time — 0 means no padding. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  etaPaddingMinutes?: number;

  /** Real per-rider cash-on-delivery warning threshold. `null` clears it (no limit). */
  @IsOptional()
  @IsInt()
  @Min(0)
  cashLimitAmount?: number | null;

  /** Real active-stop count a rider can reach before dispatch screens flag them as overloaded. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  warnAtStopCount?: number;

  /** Real minutes since a rider's last GPS fix before their position is labelled stale. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  staleLocationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  hubLat?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  hubLng?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerKm?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  riderPayPerDelivery?: number | null;

  @IsOptional()
  @IsBoolean()
  autoEtaOnAssign?: boolean;

  @IsOptional()
  @IsBoolean()
  autoEtaOnSlip?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  slipThresholdMinutes?: number;

  @IsOptional()
  @IsBoolean()
  autoFlagStalePhone?: boolean;

  @IsOptional()
  @IsBoolean()
  autoWarnCashLimit?: boolean;

  @IsOptional()
  @IsBoolean()
  autoTaskOnFailure?: boolean;

  @IsOptional()
  @IsBoolean()
  sendProofToCustomer?: boolean;

  @IsOptional()
  @IsBoolean()
  shareLiveLocation?: boolean;

  @IsOptional()
  @IsBoolean()
  enforceZoneCoverage?: boolean;

  @IsOptional()
  @IsBoolean()
  showFeeBeforeCheckout?: boolean;

  @IsOptional()
  @IsBoolean()
  pausedZonesBlockOrders?: boolean;

  @IsOptional()
  @IsBoolean()
  autoAssignNew?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  urgentAfterMinutes?: number;

  /** Order value at which a waiting order is flagged high-value. `null` turns the flag off. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  highValueAmount?: number | null;
}
