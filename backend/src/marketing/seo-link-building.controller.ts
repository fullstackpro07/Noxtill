import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  IsBoolean,
  IsEmail,
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
import { OFF_PAGE_KINDS, type OffPageKind } from './seo-off-page.service';
import { SeoLinkBuildingService } from './seo-link-building.service';

class CreateLinkBuildingOpportunityDto {
  @IsIn(OFF_PAGE_KINDS)
  kind!: OffPageKind;

  @IsString()
  @MaxLength(191)
  title!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  prospectUrl!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  targetUrl!: string;

  @IsString()
  @MaxLength(10000)
  evidenceNote!: string;

  @IsString()
  @MaxLength(10000)
  relevanceNote!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  qualityNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  riskNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  contactName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  contactSource?: string;
}

class UpdateLinkBuildingOpportunityDto {
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  targetUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  evidenceNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  relevanceNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  qualityNote?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  riskNote?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  ownerUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  contactName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  contactSource?: string | null;
}

class SaveLinkBuildingDraftDto {
  @IsString()
  @MaxLength(5000)
  outreachAngle!: string;

  @IsString()
  @MaxLength(15000)
  outreachDraft!: string;
}

class DecideLinkBuildingApprovalDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  reason?: string;
}

class RecordLinkBuildingResponseDto {
  @IsIn(['accepted', 'declined', 'other'])
  disposition!: 'accepted' | 'declined' | 'other';

  @IsString()
  @MaxLength(10000)
  responseNote!: string;
}

class MarkLinkBuildingWonDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  sourceUrl!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  targetUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  anchorText?: string;

  @IsOptional()
  @IsIn(['follow', 'nofollow', 'sponsored', 'ugc', 'unknown'])
  linkType?: 'follow' | 'nofollow' | 'sponsored' | 'ugc' | 'unknown';

  @IsString()
  @MaxLength(10000)
  evidenceNote!: string;
}

class MarkLinkBuildingLostDto {
  @IsString()
  @MaxLength(10000)
  reason!: string;
}

class RecoverLostLinkDto {
  @IsString()
  @MaxLength(10000)
  evidence!: string;
}

@Controller('seo-autopilot/link-building')
export class SeoLinkBuildingController {
  constructor(private readonly linkBuilding: SeoLinkBuildingService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.linkBuilding.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities')
  createOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLinkBuildingOpportunityDto,
  ) {
    return this.linkBuilding.createOpportunity(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Patch('opportunities/:id')
  updateOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLinkBuildingOpportunityDto,
  ) {
    return this.linkBuilding.updateOpportunity(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities/:id/qualify')
  qualify(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.linkBuilding.qualify(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities/:id/draft-ai')
  draftWithAi(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.linkBuilding.draftWithAi(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Patch('opportunities/:id/draft')
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveLinkBuildingDraftDto,
  ) {
    return this.linkBuilding.saveDraft(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities/:id/request-approval')
  submitForApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.linkBuilding.submitForApproval(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities/:id/approval')
  decideApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideLinkBuildingApprovalDto,
  ) {
    return this.linkBuilding.decideApproval(
      user.businessId,
      user.sub,
      id,
      dto.approved,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities/:id/sent')
  markSent(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.linkBuilding.markSent(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities/:id/response')
  recordResponse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordLinkBuildingResponseDto,
  ) {
    return this.linkBuilding.recordResponse(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities/:id/won')
  markWon(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkLinkBuildingWonDto,
  ) {
    return this.linkBuilding.markWon(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities/:id/lost')
  markLost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkLinkBuildingLostDto,
  ) {
    return this.linkBuilding.markLost(
      user.businessId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('links/:id/recover')
  recoverLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecoverLostLinkDto,
  ) {
    return this.linkBuilding.recoverLink(
      user.businessId,
      user.sub,
      id,
      dto.evidence,
    );
  }
}
