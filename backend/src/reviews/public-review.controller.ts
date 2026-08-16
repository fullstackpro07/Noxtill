import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PublicReviewService } from './public-review.service';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller()
export class PublicReviewController {
  constructor(private readonly publicReviewService: PublicReviewService) {}

  @Public()
  @Get('r/:token')
  getByToken(@Param('token') token: string) {
    return this.publicReviewService.getByToken(token);
  }

  @Public()
  @Post('r/:token')
  submit(@Param('token') token: string, @Body() dto: SubmitReviewDto) {
    return this.publicReviewService.submit(token, dto);
  }

  // Tighter than the global 120/min-per-IP default (BusinessThrottlerGuard) — this is a brand-new
  // unauthenticated write, so it gets its own, stricter budget rather than inheriting the app's
  // general public/AI-endpoint allowance.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reviews/qr/:slug')
  mintQrLink(@Param('slug') slug: string) {
    return this.publicReviewService.mintAnonymousLink(slug);
  }

  // The one deliberate exception to the app's strict CORS allowlist (see S3Service's doc comment:
  // "Nothing public except the review widget and public pages") — this must be fetchable from
  // arbitrary third-party websites embedding the review widget, so it gets its own explicit,
  // scoped override rather than loosening CORS globally.
  @Public()
  @Get('reviews/widget/:biz')
  async widget(
    @Param('biz') biz: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.header('Access-Control-Allow-Origin', '*');
    return this.publicReviewService.getWidget(biz);
  }
}
