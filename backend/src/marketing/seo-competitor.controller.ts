import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  SEO_COMPETITOR_KINDS,
  SeoCompetitorService,
} from './seo-competitor.service';

class CreateSeoCompetitorGapDto {
  @IsString() @MaxLength(64) competitorId!: string;
  @IsIn(SEO_COMPETITOR_KINDS) kind!: (typeof SEO_COMPETITOR_KINDS)[number];
  @IsString() @MaxLength(191) title!: string;
  @IsOptional() @IsString() @MaxLength(191) keyword?: string;
  @IsOptional() @IsString() @MaxLength(24) intent?: string;
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  competitorUrl?: string;
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  ownedPageUrl?: string;
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  sourceUrl!: string;
  @IsOptional() @IsString() @MaxLength(191) sourceLabel?: string;
  @IsString() @MaxLength(10000) evidenceNote!: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) competitorRank?: number;
  @IsOptional() @IsDateString() observedAt?: string;
}

class CreateSeoCompetitorActionDto {
  @IsIn(['keyword', 'content', 'link']) action!: 'keyword' | 'content' | 'link';
}

class TransitionSeoCompetitorGapDto {
  @IsIn(['open', 'resolved', 'dismissed']) status!:
    'open' | 'resolved' | 'dismissed';
  @IsString() @MaxLength(2000) reason!: string;
}

@Controller('seo-autopilot/competitor')
export class SeoCompetitorController {
  constructor(private readonly competitor: SeoCompetitorService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.competitor.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('gaps')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSeoCompetitorGapDto,
  ) {
    return this.competitor.createGap(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('gaps/:id/actions')
  createAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSeoCompetitorActionDto,
  ) {
    return this.competitor.createAction(
      user.businessId,
      user.sub,
      id,
      dto.action,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('gaps/:id/transition')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionSeoCompetitorGapDto,
  ) {
    return this.competitor.transition(
      user.businessId,
      user.sub,
      id,
      dto.status,
      dto.reason,
    );
  }
}
