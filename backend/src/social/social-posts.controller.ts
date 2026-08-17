import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { SocialPostsService } from './social-posts.service';
import { CreateSocialPostDto } from './dto/social-post.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SocialPostStatus } from '../../generated/prisma';

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

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('social/posts/:id/publish')
  publishNow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.posts.publishNow(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Delete('social/posts/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.posts.remove(user.businessId, id);
  }
}
