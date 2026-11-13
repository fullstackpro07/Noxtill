import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AccountService } from './account.service';
import { EmailDto, ResetPasswordDto } from './dto/account.dto';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { VerifyEmailOtpDto } from './dto/verify-otp.dto';
import {
  ConfirmPasswordDto,
  OAuthCompleteDto,
  OAuthExchangeDto,
} from './dto/social-auth.dto';
import { SocialAuthService } from './oauth/social-auth.service';
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
    private readonly social: SocialAuthService,
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

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyEmailOtpDto,
  ) {
    return this.account.verifyEmail(user.sub, dto.code);
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

  // ---- Social sign-in (auth spec §4–§7): Google, Microsoft, Facebook ----

  @Public()
  @Get('providers')
  providers() {
    return this.social.providers();
  }

  /** Kept for older clients: same as GET /auth/google/start. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google')
  async googleStart() {
    return { url: await this.social.start('google', 'login') };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':provider/start')
  async providerStart(@Param('provider') provider: string) {
    return { url: await this.social.start(provider, 'login') };
  }

  /** Registered redirect URI. Never puts Noxtill or provider tokens in the redirect. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':provider/callback')
  async providerCallback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.redirect(
      await this.social.callback(
        provider,
        { code, state, error },
        requestMeta(req),
      ),
    );
  }

  /** Redeems the one-time handoff code from the callback redirect. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  oauthExchange(@Body() dto: OAuthExchangeDto, @Req() req: Request) {
    return this.social.exchange(dto.code, requestMeta(req));
  }

  /** "Add your email" for a provider that returned none. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('oauth/complete')
  @HttpCode(HttpStatus.OK)
  oauthComplete(@Body() dto: OAuthCompleteDto, @Req() req: Request) {
    return this.social.completeSignup(dto.ticket, dto.email, requestMeta(req));
  }

  // ---- Connected accounts (auth spec §6.5) ----

  @Get('identities')
  identities(@CurrentUser() user: AuthenticatedUser) {
    return this.social.listIdentities(user.sub);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('identities/:provider/link')
  @HttpCode(HttpStatus.OK)
  linkIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Body() dto: ConfirmPasswordDto,
  ) {
    return this.social.startLink(user, provider, dto.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('identities/:provider')
  unlinkIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Body() dto: ConfirmPasswordDto,
  ) {
    return this.social.unlink(user, provider, dto.password);
  }
}
