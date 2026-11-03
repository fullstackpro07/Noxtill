import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SeoContentFormat } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoContentService, type OpportunityKind } from './seo-content.service';

class BriefFieldsDto {
  @IsOptional() @IsString() @MaxLength(300) topic?: string;
  @IsOptional() @IsString() @MaxLength(300) audience?: string;
  @IsOptional() @IsEnum(SeoContentFormat) format?: SeoContentFormat;
  @IsOptional() @IsArray() @IsString({ each: true }) outline?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) questions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) internalLinks?: string[];
  @IsOptional() @IsString() @MaxLength(20000) sourceNotes?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(64) assigneeUserId?: string;
}

class CreateBriefDto {
  @IsString() @MaxLength(300) topic!: string;
  @IsOptional() @IsString() @MaxLength(64) keywordId?: string;
  @IsOptional() @IsString() @MaxLength(24) intent?: string;
  @IsOptional() @IsString() @MaxLength(2000) strategyNote?: string;
  @IsOptional() @IsString() @MaxLength(300) audience?: string;
  @IsOptional() @IsEnum(SeoContentFormat) format?: SeoContentFormat;
  @IsOptional() @IsArray() @IsString({ each: true }) outline?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) questions?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) internalLinks?: string[];
  @IsOptional() @IsString() @MaxLength(20000) sourceNotes?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(64) assigneeUserId?: string;
}

class UpdateBriefDto extends BriefFieldsDto {
  @IsOptional() @IsString() @MaxLength(300) draftTitle?: string;
  @IsOptional() @IsString() @MaxLength(200000) draftBody?: string;
}

class GenerateBriefDto {
  @IsString() @MaxLength(64) keywordId!: string;
  @IsOptional() @IsString() @MaxLength(2000) strategyNote?: string;
}

class TransitionBriefDto {
  @IsIn(['drafting', 'approval_required', 'approved', 'dismissed'])
  status!: 'drafting' | 'approval_required' | 'approved' | 'dismissed';

  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

class PublishedDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  publishedUrl!: string;
}

class DismissOpportunityDto {
  @IsString() @MaxLength(64) keywordId!: string;
  @IsIn(['new_page', 'missing_page', 'improve']) kind!: OpportunityKind;
  @IsString() @MaxLength(2000) reason!: string;
}

@Controller('seo-autopilot/content')
export class SeoContentController {
  constructor(private readonly content: SeoContentService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.content.summary(user.businessId);
  }

  @Get('opportunities')
  opportunities(@CurrentUser() user: AuthenticatedUser) {
    return this.content.opportunities(user.businessId);
  }

  @Get('refresh-queue')
  refreshQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.content.refreshQueue(user.businessId);
  }

  @Get('briefs')
  briefs(@CurrentUser() user: AuthenticatedUser) {
    return this.content.listBriefs(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('briefs')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBriefDto) {
    return this.content.createBrief(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('briefs/generate')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateBriefDto,
  ) {
    return this.content.generateBrief(
      user.businessId,
      user.sub,
      dto.keywordId,
      dto.strategyNote,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Patch('briefs/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBriefDto,
  ) {
    return this.content.updateBrief(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('briefs/:id/draft')
  draft(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.content.generateDraft(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('briefs/:id/status')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionBriefDto,
  ) {
    return this.content.transition(
      user.businessId,
      user.sub,
      id,
      dto.status,
      dto.note,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('briefs/:id/published')
  published(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PublishedDto,
  ) {
    return this.content.recordPublished(
      user.businessId,
      user.sub,
      id,
      dto.publishedUrl,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities/dismiss')
  dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DismissOpportunityDto,
  ) {
    return this.content.dismissOpportunity(
      user.businessId,
      user.sub,
      dto.keywordId,
      dto.kind,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Delete('opportunities/:keywordId/:kind')
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('keywordId') keywordId: string,
    @Param('kind') kind: OpportunityKind,
  ) {
    return this.content.reopenOpportunity(user.businessId, keywordId, kind);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('confirm-published')
  confirm(@CurrentUser() user: AuthenticatedUser) {
    return this.content.confirmPublished(user.businessId);
  }
}
