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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import {
  ConfirmPasswordDto,
  PasskeyAuthVerifyDto,
  PasskeyRegisterVerifyDto,
  RenamePasskeyDto,
} from '../dto/social-auth.dto';
import { PasskeysService } from './passkeys.service';

const meta = (req: Request) => ({
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip,
});

/** WebAuthn passkeys (auth spec §7). Auth is global; sign-in routes are explicitly @Public. */
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

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('authenticate/options')
  @HttpCode(HttpStatus.OK)
  authOptions() {
    return this.passkeys.authenticationOptions();
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('authenticate/verify')
  @HttpCode(HttpStatus.OK)
  authVerify(@Body() dto: PasskeyAuthVerifyDto, @Req() req: Request) {
    return this.passkeys.authenticationVerify(
      dto.challengeId,
      dto.response,
      meta(req),
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
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmPasswordDto,
  ) {
    return this.passkeys.remove(user, id, dto.password);
  }
}
