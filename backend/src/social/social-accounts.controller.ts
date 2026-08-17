import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { IsString } from 'class-validator';
import { SocialAccountsService } from './social-accounts.service';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { parseSocialPlatform } from './social-platform.util';

class ConnectWithTokenDto {
  @IsString()
  token!: string;
}

@Controller()
export class SocialAccountsController {
  constructor(
    private readonly accounts: SocialAccountsService,
    private readonly config: ConfigService,
  ) {}

  @Get('social/accounts')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.accounts.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('social/:platform/connect')
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platform') platform: string,
  ) {
    return this.accounts.connect(
      user.businessId,
      parseSocialPlatform(platform),
    );
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('social/:platform/connect-with-token')
  connectWithToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platform') platform: string,
    @Body() dto: ConnectWithTokenDto,
  ) {
    return this.accounts.connectWithToken(
      user.businessId,
      parseSocialPlatform(platform),
      dto.token,
    );
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Post('social/:platform/disconnect')
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platform') platform: string,
  ) {
    return this.accounts.disconnect(
      user.businessId,
      parseSocialPlatform(platform),
    );
  }

  /** No JWT is available here — the provider redirects the browser directly, same reasoning as `IntegrationsController.callback`. */
  @Public()
  @Get('social/:platform/callback')
  async callback(
    @Param('platform') platform: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const parsedPlatform = parseSocialPlatform(platform);

    try {
      const { ok } = await this.accounts.handleCallback(
        parsedPlatform,
        code,
        state,
      );
      res.redirect(
        ok
          ? `${frontendUrl}/social?connected=${parsedPlatform}`
          : `${frontendUrl}/social?error=${parsedPlatform}`,
      );
    } catch {
      res.redirect(`${frontendUrl}/social?error=${parsedPlatform}`);
    }
  }
}
