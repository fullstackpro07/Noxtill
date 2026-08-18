import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';
import { OfferWaitlistEntryDto } from './dto/offer-waitlist-entry.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { WaitlistStatus } from '@prisma/client';

@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  join(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWaitlistEntryDto,
  ) {
    return this.waitlistService.join(user.businessId, dto);
  }

  @Get()
  list(@Query('status') status?: WaitlistStatus) {
    return this.waitlistService.list(status);
  }

  @Post(':id/offer')
  offer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OfferWaitlistEntryDto,
  ) {
    return this.waitlistService.offer(user.businessId, id, dto);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.waitlistService.accept(user.businessId, id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.waitlistService.cancel(id);
  }
}
