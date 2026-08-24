import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReviewsService } from './reviews.service';
import { ReviewRequestsService } from './review-requests.service';
import { QrPosterService } from './qr-poster.service';
import { SentimentAnalysisService } from './sentiment-analysis.service';
import { ReputationScoreService } from './reputation-score.service';
import { CreateReviewRequestDto } from './dto/create-review-request.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { ReplyFeedbackDto } from './dto/reply-feedback.dto';
import { GenerateQrPosterDto } from './dto/generate-qr-poster.dto';
import { UpdateReviewSettingsDto } from './dto/update-review-settings.dto';
import { BulkCreateReviewRequestsDto } from './dto/bulk-create-review-requests.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller()
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly reviewRequests: ReviewRequestsService,
    private readonly qrPoster: QrPosterService,
    private readonly sentimentAnalysis: SentimentAnalysisService,
    private readonly reputationScore: ReputationScoreService,
  ) {}

  @Post('reviews/requests')
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewRequestDto,
  ) {
    return this.reviewRequests.create(user.businessId, dto);
  }

  @Post('reviews/requests/bulk')
  bulkCreateRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkCreateReviewRequestsDto,
  ) {
    return this.reviewRequests.bulkCreate(
      user.businessId,
      dto.customerIds,
      dto.source,
    );
  }

  @Get('reviews/requests')
  listRequests() {
    return this.reviewsService.listRequests();
  }

  @Get('reviews/requests/conversion')
  requestsConversion() {
    return this.reviewsService.conversionByChannel();
  }

  @Get('reviews/qr-stats')
  qrStats() {
    return this.reviewsService.qrStats();
  }

  @Get('reviews/reputation-score')
  reputationScoreGet() {
    return this.reputationScore.getScore();
  }

  @Get('reviews/settings')
  getSettings() {
    return this.reviewsService.getSettings();
  }

  @Patch('reviews/settings')
  updateSettings(@Body() dto: UpdateReviewSettingsDto) {
    return this.reviewsService.updateSettings(dto);
  }

  @Post('reviews/settings/logo')
  @UseInterceptors(FileInterceptor('logo'))
  uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('logo file is required');
    return this.reviewsService.uploadLogo(file);
  }

  @Delete('reviews/settings/logo')
  removeLogo() {
    return this.reviewsService.removeLogo();
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
