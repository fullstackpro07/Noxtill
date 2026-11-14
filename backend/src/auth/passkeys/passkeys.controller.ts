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
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import {
  ConfirmPasswordDto,
  PasskeyAuthVerifyDto,
  PasskeyMfaVerifyDto,
  PasskeyOptionsDto,
  PasskeyRegisterVerifyDto,
  RenamePasskeyDto,
} from '../dto/social-auth.dto';
import type { LoginOutcome, RequestMeta } from '../auth.service';
import {
  clearSessionCookies,
  cookieName,
  readCookie,
  setDeviceCookie,
  setSessionCookies,
} from '../security/auth-cookies';
import { PasskeysService } from './passkeys.service';

function meta(req: Request, res?: Response): RequestMeta {
  let deviceId = readCookie(req, cookieName.device());
  if (!deviceId && res) {
    deviceId = randomBytes(32).toString('base64url');
    setDeviceCookie(res, deviceId);
  }
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip, deviceId };
}

function respond(res: Response, outcome: LoginOutcome) {
  if (outcome.status !== 'authenticated') return outcome;
  setSessionCookies(res, outcome.tokens);
  return {
    status: outcome.status,
    user: outcome.user,
    csrfToken: outcome.csrfToken,
    mfaSetupRequired: outcome.mfaSetupRequired,
  };
}

/** WebAuthn passkeys (auth spec §5). Auth is global; sign-in routes are explicitly @Public. */
@Controller('auth/passkeys')
export class PasskeysController {
  constructor(private readonly passkeys: PasskeysService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.passkeys.list(user.sub);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register/options')
  @HttpCode(HttpStatus.OK)
  registerOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmPasswordDto,
  ) {
    return this.passkeys.registrationOptions(user, dto.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register/verify')
  @HttpCode(HttpStatus.OK)
  registerVerify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PasskeyRegisterVerifyDto,
    @Req() req: Request,
  ) {
    return this.passkeys.registrationVerify(
      user,
      dto.challengeId,
      dto.response,
      dto.label,
      meta(req),
    );
  }

  /** Usernameless sign-in, or (with `ticket`) the second-factor step of a sign-in. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('authenticate/options')
  @HttpCode(HttpStatus.OK)
  authOptions(@Body() dto: PasskeyOptionsDto, @Req() req: Request) {
    return this.passkeys.authenticationOptions({
      ticket: dto.ticket,
      ip: req.ip,
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('authenticate/verify')
  @HttpCode(HttpStatus.OK)
  async authVerify(
    @Body() dto: PasskeyMfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outcome = await this.passkeys.authenticationVerify(
      dto.challengeId,
      dto.response,
      meta(req, res),
      { ticket: dto.ticket },
    );
    return respond(res, outcome as LoginOutcome);
  }

  /** Step-up with a passkey for elevated actions (billing, payroll, exports). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('step-up/options')
  @HttpCode(HttpStatus.OK)
  stepUpOptions(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.passkeys.authenticationOptions({ user, ip: req.ip });
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('step-up/verify')
  @HttpCode(HttpStatus.OK)
  stepUpVerify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PasskeyAuthVerifyDto,
    @Req() req: Request,
  ) {
    return this.passkeys.authenticationVerify(
      dto.challengeId,
      dto.response,
      meta(req),
      { user },
    );
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RenamePasskeyDto,
  ) {
    return this.passkeys.rename(user.sub, id, dto.label);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  // DELETE with a body: the password fallback for fresh authentication.
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.passkeys.remove(user, id, dto.password);
    // Removing a sign-in method signs out every session, this one included (§9.3).
    clearSessionCookies(res);
    return result;
  }
}
