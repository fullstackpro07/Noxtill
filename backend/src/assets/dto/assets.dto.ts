import { Type } from 'class-transformer';
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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Screen / drawer / export scope (JSON-encoded filter objects arrive as strings). */
export class AmScopeQuery {
  @IsOptional() @IsString() tab?: string;
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsString() f?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() seg?: string;
  @IsOptional() @IsString() cur?: string;
  @IsOptional() @IsString() sec?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() arch?: string;
  @IsOptional() @IsString() techAll?: string;
  @IsOptional() @IsString() wtab?: string;
  @IsOptional() @IsString() what?: string;
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: string;
  @IsOptional() @IsString() code?: string;
}

export class AssetDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(30) number?: string;
  @IsOptional() @IsString() @MaxLength(60) tag?: string;
  @IsOptional() @IsString() @MaxLength(80) barcode?: string;
  @IsOptional() @IsString() @MaxLength(80) serial?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() criticality?: string;
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsString() @MaxLength(80) manufacturer?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() ownerType?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() finAssetId?: string;
  @IsOptional() @IsString() purchasedOn?: string;
  @IsOptional() @IsString() installedOn?: string;
  @IsOptional() @Type(() => Number) @IsNumber() cost?: number | null;
  @IsOptional() @IsString() @MaxLength(120) warrantyProvider?: string;
  @IsOptional() @IsString() warrantyType?: string;
  @IsOptional() @IsString() warrantyStart?: string;
  @IsOptional() @IsString() warrantyEnd?: string;
  @IsOptional() @IsString() meterType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() initialReading?: number | null;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsBoolean() dupOk?: boolean;
  @IsOptional() @IsInt() expectedVersion?: number;
  @IsOptional() @IsObject() custom?: Record<string, unknown>;
}

export class StatusDto {
  @IsString() to!: string;
  @IsString() @MaxLength(500) reason!: string;
}

export class TransferDto {
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsString() effective!: string;
  @IsOptional() @IsString() teamId?: string;
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class RetireDto {
  @IsString() to!: string;
  @IsString() date!: string;
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsString() disposition?: string;
  @IsOptional() @IsString() replacementId?: string;
  @IsOptional() @IsString() @MaxLength(60) finRef?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ReasonDto {
  @IsString() @MaxLength(500) reason!: string;
}

export class BulkDto {
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) ids!: string[];
  @IsString() act!: string;
  @IsOptional() @IsString() value?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @Type(() => Number) @IsInt() interval?: number;
}

export class DocDto {
  @IsOptional() @IsString() type?: string;
}

export class ReadingDto {
  @IsString() assetId!: string;
  @Type(() => Number) @IsNumber() value!: number;
  @IsOptional() @IsString() source?: string;
}

export class CorrectDto {
  @Type(() => Number) @IsNumber() value!: number;
  @IsString() @MaxLength(255) reason!: string;
}

export class RequestDto {
  @IsString() assetId!: string;
  @IsOptional() @IsString() issueType?: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() observed?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsBoolean() safety?: boolean;
  @IsOptional() @IsBoolean() operational?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() reading?: number | null;
  @IsOptional() @IsString() preferredOn?: string;
  @IsOptional() @IsBoolean() draft?: boolean;
}

export class ReqActionDto {
  @IsString() act!: string;
  @IsOptional() @IsString() who?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(2000) question?: string;
}

class PartLine {
  @IsString() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) qty!: number;
}

export class WoDto {
  @IsOptional() @IsString() assetId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() @MaxLength(4000) scope?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsBoolean() safety?: boolean;
  @IsOptional() @IsString() who?: string;
  @IsOptional() @IsString() start?: string;
  @IsString() due!: string;
  @IsOptional() @Type(() => Number) @IsNumber() expectedDownH?: number | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  checklist?: string[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartLine)
  parts?: PartLine[];
  @IsOptional() @Type(() => Number) @IsNumber() estCost?: number | null;
}

export class MoveDto {
  @IsString() action!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class AssignDto {
  @IsString() who!: string;
}

export class ScheduleDto {
  @IsString() date!: string;
  @IsOptional() @IsString() time?: string;
  @IsOptional() @IsString() due?: string;
}

export class PriorityDto {
  @IsString() priority!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class PartDto {
  @IsString() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) qty!: number;
}

export class ReturnDto {
  @Type(() => Number) @IsInt() @Min(1) qty!: number;
}

export class LaborDto {
  @IsOptional() @IsString() userId?: string;
  @Type(() => Number) @IsNumber() hours!: number;
}

export class CostDto {
  @IsIn(['Vendor', 'Other']) type!: string;
  @Type(() => Number) @IsNumber() amount!: number;
  @IsOptional() @IsString() finBillId?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class BillLinkDto {
  @IsOptional() @IsString() finBillId?: string | null;
}

export class CompleteDto {
  @IsString() outcome!: string;
  @IsString() @MaxLength(4000) work!: string;
  @IsString() condition!: string;
  @IsOptional() @Type(() => Number) @IsNumber() reading?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() laborHours?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() vendorCost?: number | null;
  @IsOptional() @IsString() finBillId?: string;
  @IsOptional() @IsBoolean() endDowntime?: boolean;
  @IsOptional() @IsString() statusAfter?: string;
  @IsOptional() @IsString() @MaxLength(255) next?: string;
  @IsOptional() @IsBoolean() followUp?: boolean;
}

export class PlanDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() assetId!: string;
  @IsOptional() @IsString() templateId?: string;
  @IsIn(['Time', 'Meter', 'Hybrid']) trigger!: string;
  @Type(() => Number) @IsInt() @Min(1) interval!: number;
  @IsString() unit!: string;
  @IsOptional() @IsString() nextDueOn?: string;
  @IsOptional() @Type(() => Number) @IsNumber() nextDueMeter?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() meterInterval?: number | null;
  @IsOptional() @IsString() who?: string;
  @IsOptional() @IsBoolean() autoCreate?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() leadDays?: number;
  @IsOptional() @IsString() @MaxLength(40) tolerance?: string;
}

export class RescheduleDto {
  @IsString() date!: string;
  @IsString() @MaxLength(500) reason!: string;
}

export class PlanStatusDto {
  @IsIn(['Pause', 'Resume', 'Archive']) act!: 'Pause' | 'Resume' | 'Archive';
}

export class DowntimeDto {
  @IsString() assetId!: string;
  @IsIn(['Planned', 'Unplanned']) kind!: string;
  @IsString() reason!: string;
  @IsString() @MaxLength(255) cause!: string;
  @IsOptional() @IsString() @MaxLength(255) impact?: string;
  @IsOptional() @IsString() woId?: string;
}

export class InspectDto {
  @IsString() assetId!: string;
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsString() @MaxLength(80) checklistRef?: string;
  @IsIn(['Pass', 'Fail']) result!: string;
  @IsOptional() @Type(() => Number) @IsNumber() score?: number | null;
  @IsOptional() @IsString() condition?: string;
  @IsString() @MaxLength(4000) findings!: string;
  @IsOptional() @IsBoolean() critical?: boolean;
  @IsOptional() @IsString() @MaxLength(500) recommendation?: string;
}

export class ServiceDto {
  @IsString() assetId!: string;
  @IsString() type!: string;
  @IsOptional() @IsString() woId?: string;
  @IsString() @MaxLength(4000) work!: string;
  @IsOptional() @IsString() by?: string;
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsString() outcome?: string;
}

export class CategoryDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(24) code!: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() criticality?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() warrantyType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() lifeYears?: number | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class TaxActionDto {
  @IsString() act!: string;
  @IsOptional() @IsString() to?: string;
}

export class LocationDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(40) code!: string;
  @IsString() type!: string;
  @IsString() parent!: string;
}

export class TeamDto {
  @IsString() @MaxLength(80) name!: string;
  @IsArray() @IsString({ each: true }) members!: string[];
}

export class TemplateDto {
  @IsString() @MaxLength(120) name!: string;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) checklist!: string[];
}

export class FieldDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() type!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
}

export class SettingsDto {
  @IsInt() expectedVersion!: number;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsObject() perms?: Record<string, string[]>;
}

export class SavedViewDto {
  @IsString() @MaxLength(60) name!: string;
  @IsObject() filters!: Record<string, unknown>;
}
