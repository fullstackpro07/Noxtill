import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AdminLoginDto {
  @IsString() @MaxLength(191) email!: string;
  @IsString() @MaxLength(200) password!: string;
}

export class AdminCodeDto {
  @IsString() challengeToken!: string;
  @IsString() @MaxLength(12) code!: string;
}

export class AdminRefreshDto {
  @IsString() refreshToken!: string;
}

/** Every privileged mutation carries a reason; high-risk ones also a fresh TOTP code. */
export class ReasonDto {
  @IsString() @MinLength(5) @MaxLength(2000) reason!: string;
  @IsOptional() @IsString() @MaxLength(12) totpCode?: string;
}

export class BusinessStatusDto extends ReasonDto {
  @IsIn(['active', 'suspended', 'archived']) status!: string;
}

export class UserStatusDto extends ReasonDto {
  @IsIn(['active', 'suspended']) status!: 'active' | 'suspended';
}

export class NoteDto {
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
}

export class RoleChangeDto extends ReasonDto {
  @IsIn(['manager', 'staff']) role!: string;
}

export class MembershipActiveDto extends ReasonDto {
  @IsBoolean() active!: boolean;
}

export class PlanDto extends ReasonDto {
  @IsOptional() @IsString() @MaxLength(40) key?: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() @Min(0) yearlyPrice?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number;
  @IsOptional() @IsInt() displayOrder?: number;
  @IsOptional() @IsBoolean() purchasable?: boolean;
  @IsOptional() @IsIn(['draft', 'active', 'retired']) status?: string;
  @IsOptional() @IsString() @MaxLength(191) stripePriceId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) stripeYearlyPriceId?: string | null;
}

export class EntitlementRowDto {
  @IsString() @MaxLength(64) metricCode!: string;
  @IsIn(['capacity', 'allowance', 'spend_cap', 'feature', 'passthrough'])
  kind!: string;
  @IsOptional() @IsNumber() @Min(0) includedQuantity!: number | null;
  @IsOptional() @IsIn(['none', 'period', 'one_off']) resetRule?: string;
}

export class PlanEntitlementsDto extends ReasonDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntitlementRowDto)
  entitlements!: EntitlementRowDto[];
}

export class AssignPlanDto extends ReasonDto {
  @IsString() planKey!: string;
  @IsIn(['month', 'year']) interval!: 'month' | 'year';
}

export class ExtendTrialDto extends ReasonDto {
  @IsInt() @Min(1) @Max(90) days!: number;
}

export class OverrideDto extends ReasonDto {
  @IsString() @MaxLength(64) metricCode!: string;
  @IsNumber() @Min(0) includedQuantity!: number;
  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsString() expiresAt?: string;
}

export class ModuleGlobalDto extends ReasonDto {
  @IsBoolean() disabled!: boolean;
}

export class ModuleTenantDto extends ReasonDto {
  @IsIn(['suspended', 'restricted', 'clear']) state!:
    'suspended' | 'restricted' | 'clear';
  @IsOptional() @IsString() expiresAt?: string;
}

export class CreditAdjustDto extends ReasonDto {
  @IsInt() delta!: number;
}

export class CreateAdminDto extends ReasonDto {
  @IsString() @MaxLength(191) email!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(32) roleKey!: string;
}

export class UpdateAdminDto extends ReasonDto {
  @IsOptional() @IsString() @MaxLength(32) roleKey?: string;
  @IsOptional() @IsIn(['active', 'disabled']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
}

export class AdminRoleDto extends ReasonDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray() @IsString({ each: true }) permissions!: string[];
}
