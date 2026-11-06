import { Body, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SuperAdminController } from './super-admin-controller.decorator';
import { AdminAuthService } from '../services/admin-auth.service';
import {
  AdminOpen,
  CurrentAdmin,
  type AdminContext,
} from '../super-admin.decorators';
import {
  AdminCodeDto,
  AdminLoginDto,
  AdminRefreshDto,
} from '../dto/super-admin.dto';

const meta = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

@SuperAdminController('auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @AdminOpen()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, meta(req));
  }

  /** Second step of every login, and the first-time authenticator enrollment. */
  @AdminOpen()
  @Post('verify')
  @HttpCode(200)
  verify(@Body() dto: AdminCodeDto, @Req() req: Request) {
    return this.auth.completeLogin(dto.challengeToken, dto.code, meta(req));
  }

  @AdminOpen()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: AdminRefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, meta(req));
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentAdmin() admin: AdminContext) {
    await this.auth.logout(admin.sessionId);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentAdmin() admin: AdminContext) {
    return this.auth.profile(admin.id);
  }
}
