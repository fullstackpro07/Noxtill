import {
  Controller,
  Delete,
  Get,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

/** Device list (spec §9.2): device, browser, approximate location, first seen, last active, current. */
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.list(user.sub, user.sessionId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.revokeOwn(user.sub, id);
  }
}
