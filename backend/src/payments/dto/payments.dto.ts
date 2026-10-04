import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Screen scope. view / f / page are JSON-encoded objects (tab views, filters, paging). */
export class PayScopeQuery {
  @IsOptional() @IsString() @MaxLength(20) tab?: string;
  @IsOptional() @IsIn(['live', 'test']) env?: string;
  @IsOptional() @IsString() @MaxLength(64) branch?: string;
  @IsOptional() @IsString() @MaxLength(12) prov?: string;
  @IsOptional() @IsString() @MaxLength(4) cur?: string;
  @IsOptional() @IsString() @MaxLength(3) period?: string;
  @IsOptional() @IsString() @MaxLength(2000) view?: string;
  @IsOptional() @IsString() @MaxLength(4000) f?: string;
  @IsOptional() @IsString() @MaxLength(500) page?: string;
  @IsOptional() @IsString() @MaxLength(20) sec?: string;
}

export class PayExportQuery extends PayScopeQuery {
  @IsOptional()
  @IsIn(['transactions', 'payouts', 'payout', 'reconciliation'])
  what?: string;
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: string;
  @IsOptional() @IsString() @MaxLength(6000) ids?: string;
  @IsOptional() @IsIn(['0', '1']) full?: string;
  @IsOptional() @IsString() @MaxLength(80) payout?: string;
}

export class PayReasonDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class PayLinkOptionsQuery {
  @IsString() @MaxLength(64) customer!: string;
}

export class CreateRequestDto {
  @IsIn(['live', 'test']) env!: 'live' | 'test';
  @IsString() @MaxLength(64) customerId!: string;
  @IsIn(['whatsapp', 'sms', 'email', 'none']) contact!:
    'whatsapp' | 'sms' | 'email' | 'none';
  @IsOptional()
  @IsIn(['Order', 'Invoice', 'Booking', 'Credit balance', ''])
  linkType?: 'Order' | 'Invoice' | 'Booking' | 'Credit balance' | '';
  @IsOptional() @IsString() @MaxLength(64) linkId?: string;
  @IsIn(['Fixed', 'Flexible']) amountType!: 'Fixed' | 'Flexible';
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsString() @MaxLength(3) currency!: string;
  @IsOptional() @IsBoolean() allowPartial?: boolean;
  @IsString() @MaxLength(300) description!: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(10) dueOn?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiresDays?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  methods?: string[];
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsString() @MaxLength(300) redirectUrl?: string;
  @IsOptional() @IsString() @MaxLength(20) template?: string;
}

export class SendRequestDto {
  @IsIn(['whatsapp', 'sms', 'email']) channel!: string;
}

export class RecordPaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsIn(['cash', 'online', 'card']) method!: 'cash' | 'online' | 'card';
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class AmountDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsBoolean() liveConfirm?: boolean;
}

export class NotifyDto {
  @IsOptional() @IsIn(['whatsapp', 'sms', 'email']) channel?: string;
  @IsOptional() @IsString() @MaxLength(1000) text?: string;
  @IsOptional() @IsBoolean() method?: boolean;
}

export class EvidenceDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) keys!: string[];
}

export class SubmitDisputeDto {
  @IsString() @MaxLength(15000) response!: string;
  @IsOptional() @IsBoolean() acceptWeaker?: boolean;
  @IsOptional() @IsBoolean() liveConfirm?: boolean;
}

export class AssignDto {
  @IsString() @MaxLength(64) userId!: string;
}

export class MethodDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(12) primary?: string;
  @IsOptional() @IsString() @MaxLength(12) fallback?: string;
  @IsOptional() @Type(() => Number) @IsNumber() minAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxAmount?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) channels?: string[];
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class RuleDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(20) level!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(999) priority!: number;
  @IsString() @MaxLength(24) method!: string;
  @IsString() @MaxLength(12) primary!: string;
  @IsOptional() @IsString() @MaxLength(12) fallback?: string;
  @IsObject() conditions!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class RuleActionDto {
  @IsIn(['up', 'down', 'enable', 'disable']) action!:
    'up' | 'down' | 'enable' | 'disable';
}

export class RouteTestDto {
  @IsString() @MaxLength(20) channel!: string;
  @IsOptional() @IsString() @MaxLength(64) branch?: string;
  @IsString() @MaxLength(2) country!: string;
  @IsString() @MaxLength(3) currency!: string;
  @Type(() => Number) @IsNumber() amount!: number;
  @IsString() @MaxLength(24) method!: string;
}

export class ImpactDto {
  @IsString() @MaxLength(24) method!: string;
  @IsOptional() @IsString() @MaxLength(20) channel?: string;
  @IsOptional() @IsString() @MaxLength(64) branch?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

export class MatchDto {
  @IsString() @MaxLength(64) txId!: string;
  @IsString() @MaxLength(300) reason!: string;
  @IsOptional() @IsBoolean() confirmLow?: boolean;
}

export class SplitDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) txIds!: string[];
  @IsString() @MaxLength(300) reason!: string;
}

export class AdjustDto {
  @IsString() @MaxLength(40) type!: string;
  @IsString() @MaxLength(300) reason!: string;
}

export class PolicySaveDto {
  @Type(() => Number) @IsInt() version!: number;
  @IsObject() patch!: Record<string, Record<string, unknown>>;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class PolicyTestDto {
  @IsString() @MaxLength(20) scenario!: string;
  @IsOptional() @IsObject() draft?: Record<string, Record<string, unknown>>;
}

export class SavedViewDto {
  @IsString() @MaxLength(60) name!: string;
  @IsObject() filters!: Record<string, unknown>;
}

export class DecideDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class PublicCheckoutDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
}
