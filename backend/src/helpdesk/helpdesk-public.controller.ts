import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { HelpdeskPortalService } from './helpdesk-portal.service';
import {
  ArticleVoteDto,
  HelpRequestDto,
  PortalRateDto,
  PortalReplyDto,
  PortalRequestDto,
} from './dto/helpdesk.dto';

/**
 * Customer-facing Helpdesk: the per-ticket portal (authorised by its unguessable token) and the
 * business's public help center. Responses carry only customer-safe fields.
 */
@Public()
@Controller('public/helpdesk')
export class HelpdeskPublicController {
  constructor(private readonly portal: HelpdeskPortalService) {}

  @Get('t/:token')
  view(@Param('token') token: string) {
    return this.portal.view(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('t/:token/reply')
  reply(@Param('token') token: string, @Body() dto: PortalReplyDto) {
    return this.portal.reply(token, dto.text);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('t/:token/rate')
  rate(@Param('token') token: string, @Body() dto: PortalRateDto) {
    return this.portal.rate(token, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('t/:token/request')
  request(@Param('token') token: string, @Body() dto: PortalRequestDto) {
    return this.portal.request(token, dto);
  }

  @Get('t/:token/attachments/:messageId/:i')
  attachment(
    @Param('token') token: string,
    @Param('messageId') messageId: string,
    @Param('i', ParseIntPipe) i: number,
  ) {
    return this.portal.attachment(token, messageId, i);
  }

  @Get('t/:token/articles/:slug')
  portalArticle(@Param('token') token: string, @Param('slug') slug: string) {
    return this.portal.portalArticle(token, slug);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('t/:token/articles/:slug/vote')
  portalVote(
    @Param('token') token: string,
    @Param('slug') slug: string,
    @Body() dto: ArticleVoteDto,
  ) {
    return this.portal.portalVote(token, slug, dto);
  }

  @Get('h/:slug')
  helpCenter(@Param('slug') slug: string) {
    return this.portal.helpCenter(slug);
  }

  @Get('h/:slug/articles/:article')
  helpArticle(@Param('slug') slug: string, @Param('article') article: string) {
    return this.portal.helpArticle(slug, article);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('h/:slug/articles/:article/vote')
  helpVote(
    @Param('slug') slug: string,
    @Param('article') article: string,
    @Body() dto: ArticleVoteDto,
  ) {
    return this.portal.helpVote(slug, article, dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('h/:slug/request')
  helpRequest(@Param('slug') slug: string, @Body() dto: HelpRequestDto) {
    return this.portal.helpRequest(slug, dto);
  }
}
