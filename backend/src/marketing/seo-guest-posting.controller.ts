import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoGuestPostingService } from './seo-guest-posting.service';

class CreateGuestPublicationDto {
  @IsString() @MaxLength(191) name!: string;
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  websiteUrl!: string;
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  topicNiches!: string[];
  @IsOptional() @IsString() @MaxLength(96) market?: string;
  @IsString() @MaxLength(10000) relevanceEvidence!: string;
  @IsString() @MaxLength(10000) qualityEvidence!: string;
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  guestPolicyUrl?: string;
  @IsOptional()
  @IsIn(['accepting', 'not_accepting', 'unknown'])
  guestPolicyStatus?: 'accepting' | 'not_accepting' | 'unknown';
  @IsOptional() @IsString() @MaxLength(191) contactName?: string;
  @IsOptional() @IsEmail() @MaxLength(191) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(10000) contactSource?: string;
}

class UpdateGuestPublicationDto {
  @IsOptional() @IsString() @MaxLength(191) name?: string;
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  websiteUrl?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  topicNiches?: string[];
  @IsOptional() @IsString() @MaxLength(96) market?: string | null;
  @IsOptional() @IsString() @MaxLength(10000) relevanceEvidence?: string;
  @IsOptional() @IsString() @MaxLength(10000) qualityEvidence?: string;
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  guestPolicyUrl?: string | null;
  @IsOptional()
  @IsIn(['accepting', 'not_accepting', 'unknown'])
  guestPolicyStatus?: 'accepting' | 'not_accepting' | 'unknown';
  @IsOptional() @IsString() @MaxLength(191) contactName?: string | null;
  @IsOptional() @IsEmail() @MaxLength(191) contactEmail?: string | null;
  @IsOptional() @IsString() @MaxLength(10000) contactSource?: string | null;
}

class QualifyGuestPublicationDto {
  @IsIn(['qualified', 'disqualified'])
  status!: 'qualified' | 'disqualified';
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

class CreateGuestTopicDto {
  @IsString() @MaxLength(300) topicIdea!: string;
  @IsOptional() @IsString() @MaxLength(10000) sourceNotes?: string;
}

class GenerateGuestTopicsDto {
  @IsString() @MaxLength(10000) sourceNotes!: string;
}

class UpdateGuestPitchDto {
  @IsOptional() @IsString() @MaxLength(300) topicIdea?: string;
  @IsOptional() @IsString() @MaxLength(300) pitchSubject?: string | null;
  @IsOptional() @IsString() @MaxLength(10000) pitchBody?: string | null;
  @IsOptional() @IsString() @MaxLength(10000) sourceNotes?: string | null;
}

class GenerateGuestPitchDto {
  @IsOptional() @IsString() @MaxLength(10000) sourceNotes?: string;
}

class GuestDecisionDto {
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

class ConfirmGuestOutreachSentDto {
  @IsString() @MaxLength(2000) note!: string;
}

class RecordGuestResponseDto {
  @IsIn(['accepted', 'declined', 'revision_requested'])
  status!: 'accepted' | 'declined' | 'revision_requested';
  @IsString() @MaxLength(10000) note!: string;
}

class GuestArticleDraftDto {
  @IsString() @MaxLength(300) articleTitle!: string;
  @IsString() @MaxLength(200000) articleBody!: string;
  @IsOptional() @IsString() @MaxLength(10000) sourceNotes?: string;
}

class GenerateGuestArticleDto {
  @IsOptional() @IsString() @MaxLength(10000) sourceNotes?: string;
}

class RecordGuestPlacementDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  publishedUrl!: string;
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  placementTargetUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) placementAnchor?: string;
  @IsString() @MaxLength(10000) placementEvidence!: string;
}

class VerifyGuestPlacementDto {
  @IsString() @MaxLength(2000) confirmation!: string;
}

@Controller('seo-autopilot/guest-posting')
export class SeoGuestPostingController {
  constructor(private readonly guestPosting: SeoGuestPostingService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.guestPosting.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('publications')
  createPublication(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGuestPublicationDto,
  ) {
    return this.guestPosting.createPublication(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Patch('publications/:id')
  updatePublication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGuestPublicationDto,
  ) {
    return this.guestPosting.updatePublication(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('publications/:id/qualification')
  qualifyPublication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: QualifyGuestPublicationDto,
  ) {
    return this.guestPosting.qualifyPublication(
      user.businessId,
      user.sub,
      id,
      dto.status,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('publications/:id/topic-ideas')
  createTopicIdea(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateGuestTopicDto,
  ) {
    return this.guestPosting.createTopicIdea(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('publications/:id/generate-topic-ideas')
  generateTopicIdeas(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenerateGuestTopicsDto,
  ) {
    return this.guestPosting.generateTopicIdeas(
      user.businessId,
      user.sub,
      id,
      dto.sourceNotes,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Patch('pitches/:id')
  updatePitch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateGuestPitchDto,
  ) {
    return this.guestPosting.updatePitch(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/generate-pitch')
  generatePitch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenerateGuestPitchDto,
  ) {
    return this.guestPosting.generatePitch(
      user.businessId,
      user.sub,
      id,
      dto.sourceNotes,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/submit')
  submitPitch(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.guestPosting.submitPitchForApproval(
      user.businessId,
      user.sub,
      id,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/decision')
  decidePitch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestDecisionDto,
  ) {
    return this.guestPosting.decidePitch(
      user.businessId,
      user.sub,
      id,
      dto.decision,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/record-sent')
  recordSent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmGuestOutreachSentDto,
  ) {
    return this.guestPosting.markOutreachSent(
      user.businessId,
      user.sub,
      id,
      dto.note,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/response')
  recordResponse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordGuestResponseDto,
  ) {
    return this.guestPosting.recordResponse(
      user.businessId,
      user.sub,
      id,
      dto.status,
      dto.note,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/article')
  createArticleDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestArticleDraftDto,
  ) {
    return this.guestPosting.createArticleDraft(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/generate-article')
  generateArticleDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenerateGuestArticleDto,
  ) {
    return this.guestPosting.generateArticleDraft(
      user.businessId,
      user.sub,
      id,
      dto.sourceNotes,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/article/submit')
  submitArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.guestPosting.submitArticleForApproval(
      user.businessId,
      user.sub,
      id,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/article/decision')
  decideArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestDecisionDto,
  ) {
    return this.guestPosting.decideArticle(
      user.businessId,
      user.sub,
      id,
      dto.decision,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/published')
  recordPublished(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordGuestPlacementDto,
  ) {
    return this.guestPosting.recordPublished(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('pitches/:id/verify')
  verifyPlacement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VerifyGuestPlacementDto,
  ) {
    return this.guestPosting.verifyPlacement(
      user.businessId,
      user.sub,
      id,
      dto.confirmation,
    );
  }
}
