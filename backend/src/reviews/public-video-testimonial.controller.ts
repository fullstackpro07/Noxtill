import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { PublicVideoTestimonialService } from './public-video-testimonial.service';
import { Public } from '../common/decorators/public.decorator';

@Controller()
export class PublicVideoTestimonialController {
  constructor(
    private readonly publicVideoTestimonialService: PublicVideoTestimonialService,
  ) {}

  @Public()
  @Get('t/:token')
  getByToken(@Param('token') token: string) {
    return this.publicVideoTestimonialService.getByToken(token);
  }

  // Same tighter budget as the review flow's own unauthenticated write (`POST reviews/qr/:slug`).
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('t/:token')
  @UseInterceptors(FileInterceptor('video'))
  upload(
    @Param('token') token: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('video file is required');
    return this.publicVideoTestimonialService.upload(token, file);
  }
}
