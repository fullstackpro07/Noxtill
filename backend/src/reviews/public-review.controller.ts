import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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

  @Public()
  @Get('reviews/widget/:biz')
  widget(@Param('biz') biz: string) {
    return this.publicReviewService.getWidget(biz);
  }
}
