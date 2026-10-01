import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  MinLength,
  ValidateNested,
} from 'class-validator';

export class FinScopeQuery {
  @IsOptional() @IsString() @MaxLength(12) period?: string;
  @IsOptional() @IsString() @MaxLength(64) branch?: string;
  @IsOptional() @IsIn(['base', 'txn']) cur?: string;
  @IsOptional() @IsString() @MaxLength(64) bver?: string;
  @IsOptional() @IsIn(['pl', 'bs', 'cf', 'tb']) stmt?: string;
  @IsOptional() @IsIn(['0', '1']) cmp?: string;
  @IsOptional() @IsString() @MaxLength(64) account?: string;
  @IsOptional() @IsString() @MaxLength(24) source?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() @MaxLength(64) bank?: string;
}

export class ExportQuery extends FinScopeQuery {
  @IsOptional() @IsIn(['csv', 'xlsx', 'pdf']) format?: string;
}

export class SweepDto {
  @IsOptional() @IsBoolean() full?: boolean;
}

export class KeyDto {
  @IsString() @MaxLength(200) key!: string;
}

export class ReasonDto {
  @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}

export class CommentDto {
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class NoteDto {
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class JournalLineDto {
  @IsOptional() @IsString() accountId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsNumber() @Min(0) debit?: number;
  @IsOptional() @IsNumber() @Min(0) credit?: number;
  @IsOptional() @IsString() @MaxLength(40) department?: string | null;
  @IsOptional() @IsString() branchId?: string | null;
}

export class JournalDto {
  @IsString() date!: string;
  @IsIn(['Adjustment', 'Accrual', 'Prepayment', 'Reclass']) type!: string;
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) memo?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() branchId?: string | null;
  @IsOptional() @IsBoolean() autoReverse?: boolean;
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
  @IsOptional() @IsInt() version?: number;
}

export class ReverseDto extends ReasonDto {
  @IsString() date!: string;
}

export class AccountDto {
  @IsString() @MaxLength(6) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsIn([
    'asset',
    'liability',
    'equity',
    'revenue',
    'cos',
    'expense',
    'other_inc',
    'other_exp',
  ])
  type!: string;
  @IsOptional() @IsString() @MaxLength(40) subtype!: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() @MaxLength(3) currency?: string | null;
  @IsOptional() @IsBoolean() reconcilable?: boolean;
  @IsOptional() @IsIn(['ar', 'ap', 'tax', 'inventory', 'fa', null]) control?:
    string | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsBoolean() requiresDepartment?: boolean;
}

export class AccountPatchDto {
  @IsOptional() @IsString() @MaxLength(6) code?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional()
  @IsIn([
    'asset',
    'liability',
    'equity',
    'revenue',
    'cos',
    'expense',
    'other_inc',
    'other_exp',
  ])
  type?: string;
  @IsOptional() @IsString() @MaxLength(40) subtype?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsBoolean() reconcilable?: boolean;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsBoolean() requiresDepartment?: boolean;
}

export class ActiveDto {
  @IsBoolean() active!: boolean;
}

export class BankAccountDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(['bank', 'cash', 'card', 'clearing', 'wallet']) kind!: string;
  @IsOptional() @IsString() @MaxLength(120) institution?: string;
  @IsOptional() @IsString() @MaxLength(8) mask?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() branchId?: string | null;
  @IsOptional() @IsIn(['stripe', 'square', 'paypal', null]) payoutProvider?:
    string | null;
  @IsOptional() @IsString() glAccountId?: string | null;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @IsString() openingDate?: string;
}

export class BankAccountPatchDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) institution?: string;
  @IsOptional() @IsString() @MaxLength(8) mask?: string;
  @IsOptional() @IsIn(['stripe', 'square', 'paypal', null]) payoutProvider?:
    string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class MatchDto {
  @IsOptional() @IsArray() @IsString({ each: true }) lineIds?: string[];
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string | null;
}

export class SplitPartDto {
  @IsString() accountId!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class SplitDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SplitPartDto)
  parts!: SplitPartDto[];
}

export class RuleDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MinLength(2) @MaxLength(120) contains!: string;
  @IsOptional() @IsIn(['in', 'out', 'any']) direction?: string;
  @IsString() accountId!: string;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string | null;
  @IsOptional() @IsIn(['suggest', 'auto']) mode?: string;
  @IsOptional() @IsString() bankAccountId?: string | null;
}

export class ReconStartDto {
  @IsString() bankAccountId!: string;
  @IsString() periodEnd!: string;
  @IsNumber() statementBalance!: number;
}

export class TimingDto {
  @IsString() lineId!: string;
  @IsBoolean() on!: boolean;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class CollectionsDto {
  @IsString() itemId!: string;
  @IsIn(['gentle', 'firm', 'final']) tone!: 'gentle' | 'firm' | 'final';
}

export class BillLineDto {
  @IsString() @MaxLength(300) description!: string;
  @IsString() accountId!: string;
  @IsOptional() @IsNumber() qty?: number;
  @IsOptional() @IsNumber() unitCost?: number;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() @MaxLength(20) taxCode?: string | null;
  @IsOptional() @IsNumber() taxAmount?: number | null;
  @IsOptional() @IsString() poItemId?: string | null;
  @IsOptional() @IsString() productId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) department?: string | null;
}

export class AttachmentDto {
  @IsString() @MaxLength(400) key!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsNumber() size!: number;
  @IsString() @MaxLength(120) type!: string;
}

export class BillDto {
  @IsString() @MinLength(1) @MaxLength(160) vendorName!: string;
  @IsOptional() @IsString() supplierId?: string | null;
  @IsOptional() @IsString() @MaxLength(80) vendorInvoiceNo?: string | null;
  @IsString() billDate!: string;
  @IsString() dueDate!: string;
  @IsOptional() @IsString() purchaseOrderId?: string | null;
  @IsOptional() @IsString() branchId?: string | null;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsIn(['Manual', 'Upload', 'Photo Digitizer']) intake?: string;
  @IsOptional() @IsObject() ocr?: Record<string, unknown>;
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentDto)
  attachment?: AttachmentDto | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  lines!: BillLineDto[];
}

export class HoldDto {
  @IsBoolean() on!: boolean;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class PayDto {
  @IsString() bankAccountId!: string;
  @IsString() date!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
}

export class FiledDto {
  @IsString() @MinLength(2) @MaxLength(80) filingRef!: string;
  @IsString() filedOn!: string;
}

export class CapitalizeDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(60) category!: string;
  @IsOptional() @IsString() branchId?: string | null;
  @IsString() acquiredOn!: string;
  @IsString() inServiceOn!: string;
  @IsNumber() cost!: number;
  @IsOptional() @IsNumber() salvage?: number;
  @IsInt() @Min(1) @Max(600) lifeMonths!: number;
  @IsOptional() @IsIn(['straight_line', 'declining']) method?: string;
  @IsOptional() @IsString() fundingAccountId?: string | null;
  @IsOptional() @IsString() billId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class PeriodDto {
  @IsString() @MaxLength(12) period!: string;
}

export class DisposeDto {
  @IsString() date!: string;
  @IsNumber() @Min(0) proceeds!: number;
  @IsOptional() @IsString() proceedsAccountId?: string | null;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class BudgetDto {
  @IsString() @MaxLength(120) name!: string;
  @IsInt() @Min(2000) @Max(2100) fiscalYear!: number;
  @IsIn(['empty', 'actuals', 'copy']) basis!: 'empty' | 'actuals' | 'copy';
  @IsOptional() @IsString() copyFromId?: string;
  @IsOptional() @IsNumber() upliftPct?: number;
  @IsOptional() @IsString() branchId?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class BudgetLineDto {
  @IsString() accountId!: string;
  @IsInt() year!: number;
  @IsInt() @Min(1) @Max(12) month!: number;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() @MaxLength(40) department?: string | null;
}

export class ExplainDto {
  @IsString() accountId!: string;
  @IsString() @MaxLength(12) period!: string;
  @IsString() @MinLength(2) @MaxLength(500) text!: string;
}

export class BudgetImportDto {
  @IsString() @MaxLength(120) name!: string;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) fiscalYear!: number;
}

export class AssignDto {
  @IsString() ownerUserId!: string;
}

export class RateDto {
  @IsString() @MaxLength(3) currency!: string;
  @IsNumber() rate!: number;
  @IsString() effectiveOn!: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class SettingsDto {
  @IsInt() version!: number;
  @IsObject() patch!: Record<string, unknown>;
}

export class TaxCodeDto {
  @IsString() @MaxLength(20) code!: string;
  @IsString() @MaxLength(80) name!: string;
  @IsNumber() @Min(0) @Max(100) rate!: number;
  @IsIn(['output', 'input']) kind!: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class InviteDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MaxLength(160) email!: string;
  @IsOptional() @IsString() @MaxLength(120) firm?: string;
  @IsIn(['Read only', 'Prepare', 'Approve']) permission!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) branches?: string[];
  @IsString() expiresOn!: string;
}

export class DuplicateQuery {
  @IsOptional() @IsString() @MaxLength(160) vendor?: string;
  @IsOptional() @IsString() @MaxLength(64) supplierId?: string;
  @IsOptional() @IsString() @MaxLength(80) invoice?: string;
  @IsOptional() @IsString() @MaxLength(64) exclude?: string;
}
