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
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AccountService } from './account.service';
import {
  ChangePasswordDto,
  EmailDto,
  ResetPasswordDto,
  TokenDto,
} from './dto/account.dto';
import {
  AuthService,
  type LoginOutcome,
  type RequestMeta,
} from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { VerifyEmailOtpDto } from './dto/verify-otp.dto';
import {
  ConfirmPasswordDto,
  LoginDeviceDto,
  LoginMfaDto,
  OAuthCompleteDto,
  OAuthConfirmLinkDto,
  OAuthExchangeDto,
  SignedRequestDto,
  StepUpDto,
  TotpConfirmDto,
} from './dto/social-auth.dto';
import {
  SocialAuthService,
  type ExchangeOutcome,
} from './oauth/social-auth.service';
import { MfaService } from './mfa/mfa.service';
import { SignInMethodsService } from './sign-in-methods.service';
import { sha256 } from './sessions.service';
import { TurnstileService } from './security/turnstile.service';
import {
  clearSessionCookies,
  cookieName,
  csrfValid,
  readCookie,
  setDeviceCookie,
  setSessionCookies,
} from './security/auth-cookies';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { PrismaService } from '../prisma/prisma.service';

/** Request metadata + the HttpOnly device cookie (issued here if the browser has none yet). */
function requestMeta(req: Request, res?: Response): RequestMeta {
  let deviceId = readCookie(req, cookieName.device());
  if (!deviceId && res) {
    deviceId = randomBytes(32).toString('base64url');
    setDeviceCookie(res, deviceId);
  }
  const country = req.headers['cf-ipcountry'];
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
    country:
      typeof country === 'string' && /^[A-Z]{2}$/.test(country)
        ? country
        : undefined,
    deviceId,
  };
}

/** Tokens become HttpOnly cookies; the JSON body never carries a session token (§8.2). */
function respond(res: Response, outcome: LoginOutcome | ExchangeOutcome) {
  if (outcome.status !== 'authenticated') return outcome;
  setSessionCookies(res, outcome.tokens);
  return {
    status: outcome.status,
    user: outcome.user,
    csrfToken: outcome.csrfToken,
    mfaSetupRequired: outcome.mfaSetupRequired,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly account: AccountService,
    private readonly social: SocialAuthService,
    private readonly mfa: MfaService,
    private readonly methods: SignInMethodsService,
    private readonly turnstile: TurnstileService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- Email + password ----

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.turnstile.assert(dto.turnstileToken, req.ip);
    const result = await this.authService.signup(dto, requestMeta(req, res));
    setSessionCookies(res, result.tokens);
    return {
      status: 'authenticated',
      business: result.business,
      user: result.user,
      verificationEmailSent: result.verificationEmailSent,
      csrfToken: result.csrfToken,
      mfaSetupRequired: true,
    };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.turnstile.assert(dto.turnstileToken, req.ip);
    return respond(
      res,
      await this.authService.login(dto, requestMeta(req, res)),
    );
  }

  /** New-device password sign-in: the code emailed in stage 1. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login/device')
  @HttpCode(HttpStatus.OK)
  async loginDevice(
    @Body() dto: LoginDeviceDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return respond(
      res,
      await this.authService.verifyLoginDevice(
        dto.ticket,
        dto.code,
        requestMeta(req, res),
      ),
    );
  }

  /** Second factor: authenticator-app code or recovery code. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('login/mfa')
  @HttpCode(HttpStatus.OK)
  async loginMfa(
    @Body() dto: LoginMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return respond(
      res,
      await this.authService.verifyLoginMfa(
        dto.ticket,
        { code: dto.code, recoveryCode: dto.recoveryCode },
        requestMeta(req, res),
      ),
    );
  }

  /** Rotates the refresh token (cookie, or body for non-browser clients) — reuse is detected. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = readCookie(req, cookieName.refresh()) ?? dto.refreshToken;
    if (!presented) throw new UnauthorizedException('Not signed in');
    try {
      const { tokens, csrfToken } = await this.authService.refresh(presented);
      setSessionCookies(res, tokens);
      return { status: 'authenticated', csrfToken };
    } catch (err) {
      clearSessionCookies(res);
      throw err;
    }
  }

  /**
   * POST only (a GET can be fired by any third-party <img>), CSRF-checked, revokes the session's
   * refresh family server-side, then clears the cookies (§9.1). Works with just the refresh cookie
   * so an expired access token can still log out.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const access = readCookie(req, cookieName.access());
    const refresh = readCookie(req, cookieName.refresh());
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : undefined;
    let session: { id: string; userId: string; businessId: string } | null =
      null;
    if (access ?? bearer) {
      session = await this.prisma.session.findUnique({
        where: { accessTokenHash: sha256((access ?? bearer)!) },
        select: { id: true, userId: true, businessId: true },
      });
    }
    if (!session && refresh) {
      const row = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: sha256(refresh) },
        select: {
          session: { select: { id: true, userId: true, businessId: true } },
        },
      });
      session = row?.session ?? null;
    }
    if (session) {
      if (access || refresh) {
        const presented = req.headers['x-csrf-token'];
        if (
          !csrfValid(
            session.id,
            Array.isArray(presented) ? presented[0] : presented,
          )
        ) {
          throw new UnauthorizedException({
            code: 'CSRF_INVALID',
            message: 'Security check failed.',
          });
        }
      }
      await this.authService.logout({
        sub: session.userId,
        businessId: session.businessId,
        sessionId: session.id,
      } as AuthenticatedUser);
    }
    clearSessionCookies(res);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logoutAll(user);
    clearSessionCookies(res);
    return result;
  }

  /** CSRF token + session state for the browser app (it never sees the session tokens). */
  @Get('session')
  session(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.sessionInfo(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('step-up')
  @HttpCode(HttpStatus.OK)
  stepUp(@CurrentUser() user: AuthenticatedUser, @Body() dto: StepUpDto) {
    return this.authService.stepUp(user, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.account.changePassword(
      user,
      dto.currentPassword,
      dto.newPassword,
    );
    clearSessionCookies(res);
    return result;
  }

  // ---- Email confirmation ----

  @Get('verification')
  verificationStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.account.verificationStatus(user.sub);
  }

  @Post('verification/resend')
  @HttpCode(HttpStatus.OK)
  resendVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.account.resendVerification(user.sub, requestMeta(req));
  }

  @Patch('verification/email')
  changeUnverifiedEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EmailDto,
    @Req() req: Request,
  ) {
    return this.account.changeUnverifiedEmail(
      user,
      dto.email,
      requestMeta(req),
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyEmailOtpDto,
    @Req() req: Request,
  ) {
    return this.account.verifyEmail(user.sub, dto.code, requestMeta(req));
  }

  // ---- Password reset ----

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: EmailDto, @Req() req: Request) {
    await this.turnstile.assert(dto.turnstileToken, req.ip);
    return this.account.forgotPassword(dto.email, requestMeta(req));
  }

  /** POST so the reset token never travels in a URL (§7.4). */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('password/reset/status')
  @HttpCode(HttpStatus.OK)
  resetTokenStatus(@Body() dto: TokenDto) {
    return this.account.resetTokenStatus(dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.account.resetPassword(dto.token, dto.password);
  }

  // ---- Second factors (authenticator app + recovery codes) ----

  @Get('mfa')
  mfaStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.mfa.status(user.sub);
  }

  @Post('mfa/totp/start')
  @HttpCode(HttpStatus.OK)
  async startTotp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmPasswordDto,
  ) {
    // A setup-required owner just signed in, so the session is fresh by definition.
    await this.methods.assertFreshAuth(user, dto.password);
    return this.mfa.startTotp(user.sub);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/totp/confirm')
  @HttpCode(HttpStatus.OK)
  confirmTotp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TotpConfirmDto,
  ) {
    return this.mfa.confirmTotp(user.sub, dto.code);
  }

  @Delete('mfa/totp')
  async disableTotp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmPasswordDto,
  ) {
    await this.methods.assertFreshAuth(user, dto.password);
    return this.mfa.disableTotp(user.sub);
  }

  @Post('mfa/recovery-codes')
  @HttpCode(HttpStatus.OK)
  async recoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmPasswordDto,
  ) {
    await this.methods.assertFreshAuth(user, dto.password);
    return this.mfa.regenerateRecoveryCodes(user.sub);
  }

  // ---- Social sign-in (Google, Microsoft, Facebook) ----

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

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  async oauthExchange(
    @Body() dto: OAuthExchangeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return respond(
      res,
      await this.social.exchange(dto.code, requestMeta(req, res)),
    );
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('oauth/complete')
  @HttpCode(HttpStatus.OK)
  async oauthComplete(
    @Body() dto: OAuthCompleteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return respond(
      res,
      await this.social.completeSignup(
        dto.ticket,
        dto.email,
        requestMeta(req, res),
      ),
    );
  }

  /** Email code proving mailbox control before a provider is linked to an existing account. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('oauth/confirm-link')
  @HttpCode(HttpStatus.OK)
  async oauthConfirmLink(
    @Body() dto: OAuthConfirmLinkDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return respond(
      res,
      await this.social.confirmLink(
        dto.ticket,
        dto.code,
        requestMeta(req, res),
      ),
    );
  }

  // ---- Meta platform callbacks for Facebook Login (spec §4.3) ----

  @Public()
  @Post('facebook/deauthorize')
  @HttpCode(HttpStatus.OK)
  facebookDeauthorize(@Body() dto: SignedRequestDto) {
    return this.social.facebookDeauthorize(dto.signed_request);
  }

  @Public()
  @Post('facebook/data-deletion')
  @HttpCode(HttpStatus.OK)
  facebookDataDeletion(@Body() dto: SignedRequestDto) {
    return this.social.facebookDataDeletion(dto.signed_request);
  }

  @Public()
  @Get('facebook/data-deletion/:code')
  facebookDeletionStatus(@Param('code') code: string) {
    return this.social.facebookDeletionStatus(code);
  }

  // ---- Connected accounts ----

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
  async unlinkIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Body() dto: ConfirmPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.social.unlink(user, provider, dto.password);
    // Removing a sign-in method signs out every session, this one included (§9.3).
    clearSessionCookies(res);
    return result;
  }
}
