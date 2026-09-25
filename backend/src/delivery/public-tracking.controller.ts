import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PublicTrackingService } from './public-tracking.service';

@Controller('public/track')
export class PublicTrackingController {
  constructor(private readonly tracking: PublicTrackingService) {}

  @Public()
  @Get(':token')
  byToken(@Param('token') token: string) {
    return this.tracking.byToken(token);
  }
}
