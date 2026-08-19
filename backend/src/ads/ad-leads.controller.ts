import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdLeadsService } from './ad-leads.service';
import { IngestAdLeadDto } from './dto/ingest-ad-lead.dto';
import { AppException } from '../common/filters/app.exception';
import { safeEqual } from '../common/webhooks/signature.util';
import { Public } from '../common/decorators/public.decorator';
import { AD_ERROR_CODES } from './ads.constants';
import { IntegrationProvider } from '@prisma/client';

function parseProvider(value: string): IntegrationProvider {
  if (!(Object.values(IntegrationProvider) as string[]).includes(value)) {
    throw new AppException(
      AD_ERROR_CODES.UNKNOWN_PROVIDER,
      `Unknown ad provider: ${value}`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return value as IntegrationProvider;
}

/**
 * Lead Inbox (UPD-BE-071). Each real ad platform's lead-gen-form webhook delivers to a
 * business-scoped URL (the businessId itself is the routing key, same convention as the AI Phone
 * Receptionist resolving a call by its dialed number) — gated by a shared secret since, unlike
 * `/webhooks/*`, no per-provider signing secret is configured for 9 different platforms yet.
 */
@Controller('ads')
export class AdLeadsController {
  constructor(
    private readonly leads: AdLeadsService,
    private readonly config: ConfigService,
  ) {}

  @Get('leads')
  list() {
    return this.leads.list();
  }

  @Public()
  @Post(':provider/:businessId/leads/webhook')
  @HttpCode(200)
  async webhook(
    @Param('provider') provider: string,
    @Param('businessId') businessId: string,
    @Query('secret') secret: string | undefined,
    @Body() dto: IngestAdLeadDto,
  ) {
    const expected = this.config.get<string>('ADS_LEADS_WEBHOOK_SECRET');
    if (!expected) {
      throw new ServiceUnavailableException(
        'Ad lead webhooks are not configured',
      );
    }
    if (!secret || !safeEqual(secret, expected)) {
      throw new ForbiddenException('Invalid webhook secret');
    }

    await this.leads.ingest(businessId, parseProvider(provider), dto);
    return { received: true };
  }
}
