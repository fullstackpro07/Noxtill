import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SocialPostsService } from './social-posts.service';
import {
  CreateSocialPostDto,
  UpdateSocialPostDto,
  BoostPostDto,
} from './dto/social-post.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SocialPlatform, SocialPostStatus } from '@prisma/client';

/** Content Calendar + Create Post (UPD-BE-046) — `GET /social/posts` (optionally filtered by status) serves as the calendar's data source; there's no separate `/content-calendar` model to duplicate. */
@Controller()
export class SocialPostsController {
  constructor(private readonly posts: SocialPostsService) {}

  @Get('social/posts')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: SocialPostStatus,
  ) {
    return this.posts.list(user.businessId, status);
  }

  /** UPD-BE-126 — must be registered before `:id` so "queue" is never matched as a post id. */
  @Get('social/posts/queue')
  listQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.posts.listQueue(user.businessId);
  }

  @Get('social/posts/:id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.posts.findOne(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('social/posts')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSocialPostDto,
  ) {
    return this.posts.create(user.businessId, user.sub, dto);
  }

  /** Draft editing fix — only accepted while the post is still a `draft`, see `SocialPostsService.update()`. */
  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Patch('social/posts/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSocialPostDto,
  ) {
    return this.posts.update(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('social/posts/:id/publish')
  publishNow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.posts.publishNow(user.businessId, id);
  }

  /** UPD-BE-126 */
  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('social/posts/:id/targets/:platform/retry')
  retryTarget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('platform') platform: SocialPlatform,
  ) {
    return this.posts.retryTarget(user.businessId, id, platform);
  }

  /** UPD-BE-127 */
  @Get('social/posts/:id/analytics')
  getAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.posts.getPostAnalytics(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('social/posts/:id/analytics/pull')
  pullAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.posts.pullPostAnalytics(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('social/posts/:id/targets/:platform/boost')
  boost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('platform') platform: SocialPlatform,
    @Body() dto: BoostPostDto,
  ) {
    return this.posts.boostAsAd(user.businessId, id, platform, dto);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Delete('social/posts/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.posts.remove(user.businessId, id);
  }
}
