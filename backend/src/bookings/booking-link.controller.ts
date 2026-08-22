import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { BookingLinkService } from './booking-link.service';
import { UpdateBookingLinkSettingsDto } from './dto/update-booking-link-settings.dto';
import { GenerateBookingQrDto } from './dto/generate-booking-qr.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('booking-link')
export class BookingLinkController {
  constructor(private readonly bookingLink: BookingLinkService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingLink.getSettings(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BOOKINGS_MANAGE)
  @Patch('settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateBookingLinkSettingsDto,
  ) {
    return this.bookingLink.updateSettings(user.businessId, dto);
  }

  @Get('stats')
  stats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('months') months?: string,
  ) {
    return this.bookingLink.stats(
      user.businessId,
      months ? Number(months) : undefined,
    );
  }

  @Post('qr')
  generateQr(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateBookingQrDto,
  ) {
    return this.bookingLink.generateQr(user.businessId, dto);
  }
}
