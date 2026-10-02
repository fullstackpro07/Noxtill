import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SeoContentRevisionStatus } from '@prisma/client';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  CreateSeoRevisionDto,
  EditSeoRevisionDto,
  SuggestSeoRevisionDto,
  TransitionSeoRevisionDto,
} from './dto/seo-on-page.dto';
import { SeoOnPageService } from './seo-on-page.service';

@Controller('seo-autopilot/on-page')
export class SeoOnPageController {
  constructor(private readonly onPage: SeoOnPageService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.onPage.summary(user.businessId);
  }

  @Get('pages')
  pages(@CurrentUser() user: AuthenticatedUser) {
    return this.onPage.pages(user.businessId);
  }

  @Get('revisions')
  revisions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('pageUrl') pageUrl?: string,
  ) {
    return this.onPage.revisions(user.businessId, pageUrl || undefined);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('revisions')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSeoRevisionDto,
  ) {
    return this.onPage.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('suggest')
  suggest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SuggestSeoRevisionDto,
  ) {
    return this.onPage.suggest(user.businessId, user.sub, dto.pageUrl);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Patch('revisions/:id')
  edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EditSeoRevisionDto,
  ) {
    return this.onPage.editDraft(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('revisions/:id/status')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionSeoRevisionDto,
  ) {
    return this.onPage.transition(
      user.businessId,
      user.sub,
      id,
      dto.status as SeoContentRevisionStatus,
      dto.note,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('revisions/:id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.onPage.restore(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('verify')
  verify(@CurrentUser() user: AuthenticatedUser) {
    return this.onPage.verifyApplied(user.businessId);
  }
}
