import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { IntegrationsService } from './integrations.service';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { IntegrationProvider } from '../../generated/prisma';

function parseProvider(value: string): IntegrationProvider {
  if (!(Object.values(IntegrationProvider) as string[]).includes(value)) {
    throw new BadRequestException(`Unknown integration provider: ${value}`);
  }
  return value as IntegrationProvider;
}

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.integrations.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post(':provider/connect')
  connect(@CurrentUser() user: AuthenticatedUser, @Param('provider') provider: string) {
    return this.integrations.connect(user.businessId, parseProvider(provider));
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post(':provider/disconnect')
  disconnect(@CurrentUser() user: AuthenticatedUser, @Param('provider') provider: string) {
    return this.integrations.disconnect(user.businessId, parseProvider(provider));
  }

  /**
   * The provider redirects the browser here directly — no JWT is available at this point (BE-082),
   * which is why `state` (not the Authorization header) is what carries and verifies the businessId.
   */
  @Public()
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const parsedProvider = parseProvider(provider);

    try {
      const { ok } = await this.integrations.handleCallback(parsedProvider, code, state);
      res.redirect(
        ok
          ? `${frontendUrl}/integrations?connected=${parsedProvider}`
          : `${frontendUrl}/integrations?error=${parsedProvider}`,
      );
    } catch {
      res.redirect(`${frontendUrl}/integrations?error=${parsedProvider}`);
    }
  }
}
