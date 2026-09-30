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
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ScopeQuery {
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsIn(['Today', '7 days', '30 days', '90 days']) range?: string;
}

export class TicketListQuery extends ScopeQuery {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() st?: string;
  @IsOptional() @IsString() pri?: string;
  @IsOptional() @IsString() ch?: string;
  @IsOptional() @IsString() cat?: string;
  @IsOptional() @IsString() agent?: string;
  @IsOptional() @IsString() queue?: string;
  @IsOptional() @IsString() br?: string;
  @IsOptional() @IsString() sla?: string;
  @IsOptional() @IsIn(['24h', '7d', '30d']) date?: string;
  @IsOptional() @IsString() cust?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional()
  @IsIn(['newest', 'oldest', 'updated', 'priority', 'sla', 'customer'])
  sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) page?: number;
  /** Rows per page (default 12, the design's page size). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class AnalyticsQuery extends ScopeQuery {
  @IsOptional() @IsString() agent?: string;
  @IsOptional() @IsString() queue?: string;
  @IsOptional() @IsString() cat?: string;
  @IsOptional() @IsString() pri?: string;
  @IsOptional() @IsString() ch?: string;
  @IsOptional() @IsIn(['csv', 'xlsx']) kind?: string;
}

export class CustomerSearchQuery {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}

export class CreateTicketDto {
  @IsString() customerId!: string;
  @IsString() @MinLength(1) @MaxLength(300) subject!: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @IsString() channel!: string;
  @IsString() category!: string;
  @IsOptional() @IsString() @MaxLength(120) subcategory?: string;
  @IsString() priority!: string;
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsString() queueId?: string;
  @IsOptional() @IsString() branchId?: string;
  /** Comma-separated. */
  @IsOptional() @IsString() @MaxLength(400) tags?: string;
  /** Unified Inbox conversation the ticket is created from. */
  @IsOptional() @IsString() conversationId?: string;
}

export class FromConversationDto {
  @IsString() conversationId!: string;
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() priority?: string;
}

export class TicketFieldDto {
  @IsIn([
    'status',
    'priority',
    'category',
    'subcategory',
    'agent',
    'queue',
    'branch',
  ])
  field!: string;
  @IsOptional() @IsString() @MaxLength(120) value?: string;
}

export class BulkDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) numbers!: string[];
  @IsIn(['assign', 'status', 'priority', 'tag', 'queue', 'close', 'resolve'])
  action!: string;
  @IsOptional() @IsString() @MaxLength(120) value?: string;
  @IsOptional() @IsString() @MaxLength(4000) note?: string;
}

export class TagDto {
  @IsString() @MinLength(1) @MaxLength(60) tag!: string;
}

export class FollowersDto {
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) userIds!: string[];
}

export class EscalateDto {
  @IsString() reason!: string;
  /** 'escalations' (the Escalations queue) or an agent user id. */
  @IsString() to!: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() @MaxLength(4000) note?: string;
}

export class MergeDto {
  /** Tickets merged into `target` (closed afterwards). */
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) sources!: string[];
  @IsString() target!: string;
}

export class SplitDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) messageIds!: string[];
  @IsString() @MinLength(1) @MaxLength(300) subject!: string;
  @IsString() priority!: string;
  @IsOptional() @IsString() agentId?: string;
}

export class LinkDto {
  @IsString() type!: string;
  @IsString() @MinLength(1) @MaxLength(60) ref!: string;
}

export class ReplyDto {
  @IsIn(['public', 'note']) mode!: string;
  @IsOptional() @IsString() @MaxLength(20000) text?: string;
  /** Status to set after sending a public reply. */
  @IsOptional() @IsString() after?: string;
  /** When the agent opened the ticket — used for collision detection. */
  @IsOptional() @IsString() since?: string;
  /** Send even though another agent replied meanwhile. */
  @IsOptional() @IsString() force?: string;
  /** Article ids inserted into this reply (counted as article links). */
  @IsOptional() @IsString() articles?: string;
}

export class CloseDto {
  @IsOptional() @IsString() @MaxLength(4000) note?: string;
}

export class AssignManyDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) numbers!: string[];
  @IsString() agentId!: string;
}

export class QueueDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsBoolean() active!: boolean;
  @IsArray() @IsString({ each: true }) members!: string[];
  @IsArray() @IsString({ each: true }) categories!: string[];
  /** Branch id, or empty/'all' for all branches. */
  @IsOptional() @IsString() branchId?: string;
  @IsString() priorityRule!: string;
  @IsString() method!: string;
}

export class QueueToggleDto {
  @IsBoolean() active!: boolean;
  /** Where open tickets move when disabling. */
  @IsOptional() @IsString() moveTo?: string;
}

export class AgentProfileDto {
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) skills!: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(500) capacity!: number;
}

export class SlaPolicyDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() applies!: string;
  @IsOptional() @IsString() @MaxLength(120) scope?: string;
  @IsString() priority!: string;
  @Type(() => Number) @IsInt() @Min(1) fr!: number;
  @Type(() => Number) @IsInt() @Min(1) res!: number;
  @IsIn(['24/7', 'Standard hours']) hours!: string;
  @IsArray() @IsString({ each: true }) pause!: string[];
  @Type(() => Number) @IsInt() @Min(10) @Max(99) warn!: number;
  @IsBoolean() active!: boolean;
}

export class ActiveDto {
  @IsBoolean() active!: boolean;
}

export class RuleDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() trigger!: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8760)
  ageHours?: number;
  @IsString() action!: string;
  /** "user:<id>" or "queue:<id>". */
  @IsString() target!: string;
  @IsBoolean() active!: boolean;
}

export class ArticleDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(160) slug?: string;
  @IsString() category!: string;
  @IsOptional() @IsString() @MaxLength(1000) summary?: string;
  @IsOptional() @IsString() @MaxLength(100000) body?: string;
  @IsOptional() @IsString() @MaxLength(400) tags?: string;
  @IsString() visibility!: string;
  @IsArray() @IsString({ each: true }) related!: string[];
  @IsString() status!: string;
}

export class ArticleActionDto {
  @IsIn(['publish', 'unpublish', 'archive', 'restore', 'review'])
  action!: string;
}

export class NameDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
}

export class SavedReplyDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MaxLength(60) shortcut!: string;
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsString() visibility!: string;
  @IsString() team!: string;
}

export class MacroDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(300) conditions?: string;
  @IsArray() @ArrayMaxSize(10) actions!: string[][];
  @IsIn(['Active', 'Disabled']) status!: string;
}

export class MacroStatusDto {
  @IsIn(['Active', 'Disabled']) status!: string;
}

export class RebalanceDto {
  @IsBoolean() apply!: boolean;
}

export class ApplyDto {
  /** r:<replyId> | m:<macroId> | k:<articleId> */
  @IsString() ref!: string;
  @IsIn(['public', 'note']) mode!: string;
}

export class CsatSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsString() delay!: string;
  @IsString() scale!: string;
  @IsBoolean() comment!: boolean;
  @IsArray() @IsString({ each: true }) channels!: string[];
  @IsString() followUp!: string;
}

export class FollowUpDto {
  @IsString() @MinLength(1) @MaxLength(4000) note!: string;
  @IsString() ownerId!: string;
}

export class FollowUpStateDto {
  @IsIn(['Open', 'Done']) state!: string;
}

export class SettingsDto {
  @IsInt() version!: number;
  @IsObject() config!: Record<string, unknown>;
}

// ── public (customer) ──────────────────────────────────────────────────────

export class PortalReplyDto {
  @IsString() @MinLength(1) @MaxLength(10000) text!: string;
}

export class PortalRateDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(10) rating!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class PortalRequestDto {
  @IsString() @MinLength(1) @MaxLength(300) subject!: string;
  @IsString() @MinLength(1) @MaxLength(10000) description!: string;
  @IsOptional() @IsString() category?: string;
}

export class HelpRequestDto extends PortalRequestDto {
  @IsString() @MinLength(1) @MaxLength(191) name!: string;
  @IsOptional() @IsString() @MaxLength(191) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  /** Honeypot: real people leave it empty. */
  @IsOptional() @IsString() website?: string;
}

export class ArticleVoteDto {
  @IsBoolean() helpful!: boolean;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}
