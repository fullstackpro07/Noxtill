import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Screen / drawer / export scope (JSON-encoded objects arrive as strings). */
export class CtScopeQuery {
  @IsOptional() @IsString() tab?: string;
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() f?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() view?: string;
  @IsOptional() @IsString() cur?: string;
  @IsOptional() @IsString() sec?: string;
  @IsOptional() @IsString() what?: string;
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: string;
  @IsOptional() @IsString() ids?: string;
}

/** JSON payload of a multipart form. */
export class FormDataDto {
  @IsString() @MaxLength(60000) data!: string;
}

export class ReasonDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class IdsDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[];
}

export class MoveDto extends IdsDto {
  @IsString() @MaxLength(60) folder!: string;
}

export class TagDto extends IdsDto {
  @IsString() @MaxLength(400) tags!: string;
}

export class OwnerDto extends IdsDto {
  @IsString() ownerId!: string;
}

export class ReviewDto extends IdsDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ShareDto {
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) userIds!: string[];
  @IsOptional() @IsString() @MaxLength(40) perm?: string;
}

export class NameDto {
  @IsString() @MaxLength(60) name!: string;
}

export class RequestDocDto {
  @IsString() party!: string;
  @IsString() @MaxLength(255) what!: string;
  @IsOptional() @IsString() due?: string;
}

export class HoldDto {
  @IsOptional() @IsString() @MaxLength(255) reason?: string | null;
}

export class TemplateDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(40) type?: string;
  @IsOptional() @IsString() @MaxLength(100000) content?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roles?: string[];
  @IsOptional() @IsString() @MaxLength(80) approval?: string;
}

export class WizardDto {
  @IsOptional() @IsString() src?: string;
  @IsOptional() @IsString() templateId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() cp?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() start?: string;
  @IsOptional() @IsString() end?: string | null;
  @IsOptional() notice?: number | string;
  @IsOptional() autoRenew?: boolean | string;
  @IsOptional() value?: number | string | null;
  @IsOptional() @IsString() @MaxLength(500) refs?: string;
  @IsOptional() @IsString() @MaxLength(100000) body?: string;
  @IsOptional() @IsString() @MaxLength(160) signer?: string;
  @IsOptional() @IsString() @MaxLength(190) email?: string;
  @IsOptional() @IsString() order?: string;
  @IsOptional() @IsString() auth?: string;
  @IsOptional() @IsString() branchId?: string | null;
}

export class EditDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() end?: string | null;
  @IsOptional() notice?: number | string;
  @IsOptional() value?: number | string | null;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @Type(() => Number) @IsInt() expectedVersion?: number;
  @IsOptional() @IsBoolean() force?: boolean;
}

export class NoteDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class TerminateDto {
  @IsString() eff!: string;
  @IsString() @MaxLength(500) reason!: string;
  @IsString() typed!: string;
}

export class RenewDto {
  @IsString() end!: string;
  @IsOptional() @IsString() @MaxLength(500) changes?: string;
}

export class WnrDto {
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsBoolean() notify?: boolean;
}

export class SnoozeDto {
  @IsString() key!: string;
  @IsString() until!: string;
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsBoolean() ok?: boolean;
}

export class MessageDto {
  @IsIn(['notify', 'replace']) kind!: 'notify' | 'replace';
  @IsString() key!: string;
  @IsString() @MaxLength(2000) msg!: string;
}

export class TermDto {
  @IsOptional() @IsString() @MaxLength(120) term?: string;
  @IsOptional() @IsString() @MaxLength(500) value?: string;
  @IsOptional() @IsString() @MaxLength(120) source?: string;
}

export class OblDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() responsible?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() due?: string;
  @IsOptional() @IsString() frequency?: string;
}

export class OblDoneDto {
  @IsOptional() @IsString() evidenceDocId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @IsBoolean() waive?: boolean;
}

export class TaskDto {
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() due?: string;
  @IsOptional() @IsString() @MaxLength(255) ref?: string;
  @IsOptional() @IsString() obligationId?: string;
  @IsOptional() @IsString() contractId?: string;
}

export class AmendDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() eff?: string;
  @IsOptional() @IsString() @MaxLength(255) sections?: string;
}

export class DecideDto {
  @IsString() dec!: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @IsOptional() @IsString() toUserId?: string | null;
}

class SignerDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(190) email?: string;
  @IsOptional() @IsString() @MaxLength(40) role?: string;
}

export class SigDto {
  @IsOptional() @IsString() docId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SignerDto)
  signers?: SignerDto[];
  @IsOptional() @IsString() order?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  fields?: string[];
  @IsOptional() @IsString() auth?: string;
  @IsOptional() @IsString() reminders?: string;
  @IsOptional() @IsString() deadline?: string;
  @IsOptional() @IsBoolean() send?: boolean;
}

export class SignerIdDto {
  @IsString() signerId!: string;
}

export class AckReqDto {
  @IsOptional() @IsIn(['pending', 'all']) scope?: string;
  @IsOptional() @IsString() @MaxLength(1000) msg?: string;
}

export class SettingsDto {
  @IsObject() config!: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsInt() expectedVersion?: number;
}

export class ExportDto {
  @IsString() what!: string;
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) ids?: string[];
}

export class PublicSignDto {
  @IsOptional() @IsIn(['Typed', 'Drawn']) sigType?: string;
  @IsOptional() @IsString() @MaxLength(90000) sigData?: string;
  @IsOptional() @IsString() @MaxLength(12) otp?: string;
  @IsOptional() @IsBoolean() agree?: boolean;
}

export class PublicDeclineDto {
  @IsString() @MaxLength(500) reason!: string;
}
