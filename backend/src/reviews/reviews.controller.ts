import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewRequestsService } from './review-requests.service';
import { QrPosterService } from './qr-poster.service';
import { SentimentAnalysisService } from './sentiment-analysis.service';
import { CreateReviewRequestDto } from './dto/create-review-request.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { ReplyFeedbackDto } from './dto/reply-feedback.dto';
import { GenerateQrPosterDto } from './dto/generate-qr-poster.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller()
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly reviewRequests: ReviewRequestsService,
    private readonly qrPoster: QrPosterService,
    private readonly sentimentAnalysis: SentimentAnalysisService,
  ) {}

  @Post('reviews/requests')
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewRequestDto,
  ) {
    return this.reviewRequests.create(user.businessId, dto);
  }

  @Get('reviews')
  list(@Query() query: QueryReviewsDto) {
    return this.reviewsService.list(query);
  }

  @Get('reviews/summary')
  summary() {
    return this.reviewsService.getSummary();
  }

  @Get('reviews/sentiment')
  sentiment(@CurrentUser() user: AuthenticatedUser) {
    return this.sentimentAnalysis.list(user.businessId);
  }

  @Post('reviews/qr-poster')
  generateQrPoster(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateQrPosterDto,
  ) {
    return this.qrPoster.generate(user.businessId, dto);
  }

  @Post('reviews/:id/reply')
  reply(@Param('id') id: string, @Body('replyText') replyText: string) {
    return this.reviewsService.reply(id, replyText);
  }

  @Post('reviews/:id/ai-draft')
  aiDraft(@Param('id') id: string) {
    return this.reviewsService.aiDraft(id);
  }

  @Patch('feedback/:id')
  updateFeedback(@Param('id') id: string, @Body() dto: UpdateFeedbackDto) {
    return this.reviewsService.updateFeedback(id, dto);
  }

  @Post('feedback/:id/reply')
  replyToFeedback(@Param('id') id: string, @Body() dto: ReplyFeedbackDto) {
    return this.reviewsService.replyToFeedback(id, dto.message);
  }
}
