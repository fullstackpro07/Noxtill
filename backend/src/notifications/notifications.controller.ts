import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.list(user.sub);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(user.sub, id);
  }
}

/** UPD-BE-122 — separate `@Controller` so `GET/PATCH /notification-preferences` reads clearly as its own resource, not a sub-route of the notification inbox. */
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Omitting `?userId=` views your own effective preferences (defaults + your own overrides) — always self-permitted. Passing another staff member's id needs manage capability. */
  @Get()
  getMatrix(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    const target = userId ?? user.sub;
    this.notifications.assertSelfOrManaging(
      user.sub,
      user.capabilities,
      target,
    );
    return this.notifications.getPreferenceMatrix(user.businessId, target);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    this.notifications.assertSelfOrManaging(
      user.sub,
      user.capabilities,
      dto.userId,
    );
    return this.notifications.setPreferences(user.businessId, dto);
  }
}
