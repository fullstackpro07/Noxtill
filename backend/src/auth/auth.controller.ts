import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AccountService } from './account.service';
import { EmailDto, ResetPasswordDto, TokenDto } from './dto/account.dto';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { Confirm2faDto } from './dto/confirm-2fa.dto';
import { Disable2faDto } from './dto/disable-2fa.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

function requestMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly account: AccountService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('signup')
  signup(@Body() dto: SignupDto, @Req() req: Request) {
    return this.authService.signup(dto, requestMeta(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, requestMeta(req));
  }

  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  verifyTwoFactorLogin(@Body() dto: Verify2faDto, @Req() req: Request) {
    return this.authService.verifyTwoFactorLogin(
      dto.tempToken,
      dto.code,
      requestMeta(req),
    );
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  enableTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.enableTwoFactor(user.sub, user.businessId);
  }

  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  confirmTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Confirm2faDto,
  ) {
    return this.authService.confirmTwoFactor(user.sub, dto.code);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  disableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Disable2faDto,
  ) {
    return this.authService.disableTwoFactor(user.sub, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.sessionId);
  }

  // ---- Auth & Onboarding: email confirmation ----

  @Get('verification')
  verificationStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.account.verificationStatus(user.sub);
  }

  @Post('verification/resend')
  @HttpCode(HttpStatus.OK)
  resendVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.account.resendVerification(user.sub);
  }

  @Patch('verification/email')
  changeUnverifiedEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EmailDto,
  ) {
    return this.account.changeUnverifiedEmail(
      user.sub,
      user.businessId,
      dto.email,
    );
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: TokenDto) {
    return this.account.verifyEmail(dto.token);
  }

  // ---- Auth & Onboarding: password reset ----

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: EmailDto) {
    return this.account.forgotPassword(dto.email);
  }

  @Public()
  @Get('password/reset')
  resetTokenStatus(@Query('token') token: string) {
    return this.account.resetTokenStatus(token ?? '');
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.account.resetPassword(dto.token, dto.password);
  }

  // ---- Auth & Onboarding: social sign-in ----

  @Public()
  @Get('providers')
  providers() {
    return this.account.providers();
  }

  @Public()
  @Get('google')
  async googleStart() {
    return { url: await this.account.googleAuthUrl() };
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.redirect(
      await this.account.googleCallback(code, state, requestMeta(req)),
    );
  }
}
