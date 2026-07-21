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
import { CreateReviewRequestDto } from './dto/create-review-request.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller()
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly reviewRequests: ReviewRequestsService,
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
}
