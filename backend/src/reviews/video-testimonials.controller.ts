import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { VideoTestimonialsService } from './video-testimonials.service';
import { RequestVideoTestimonialDto } from './dto/request-video-testimonial.dto';
import { RejectVideoTestimonialDto } from './dto/reject-video-testimonial.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { VideoTestimonialStatus } from '../../generated/prisma';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('video-testimonials')
export class VideoTestimonialsController {
  constructor(
    private readonly videoTestimonialsService: VideoTestimonialsService,
  ) {}

  @Post('request')
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestVideoTestimonialDto,
  ) {
    return this.videoTestimonialsService.request(user.businessId, dto);
  }

  @Get()
  list(@Query('status') status?: VideoTestimonialStatus) {
    return this.videoTestimonialsService.list(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.videoTestimonialsService.findOne(id);
  }

  @RequireCapability(CAPABILITIES.VIDEO_TESTIMONIALS_MODERATE)
  @Patch(':id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.videoTestimonialsService.approve(id, user.sub);
  }

  @RequireCapability(CAPABILITIES.VIDEO_TESTIMONIALS_MODERATE)
  @Patch(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectVideoTestimonialDto,
  ) {
    return this.videoTestimonialsService.reject(id, dto, user.sub);
  }
}
