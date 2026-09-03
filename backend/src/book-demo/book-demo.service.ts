import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BookDemoRequestDto } from './dto/book-demo-request.dto';

const SALES_INBOX = 'sales@noxtill.com';

/**
 * Sends the marketing site's "Book a Demo" form straight to Sales — same Resend HTTP API as
 * `messaging/channels/email.service.ts`, called directly here since that service's
 * `ChannelSendParams` contract requires a tenant `businessId`/`locale` that don't apply to an
 * anonymous public-website lead.
 */
@Injectable()
export class BookDemoService {
  private readonly logger = new Logger(BookDemoService.name);

  constructor(private readonly config: ConfigService) {}

  async notifySales(dto: BookDemoRequestDto): Promise<void> {
    if (dto.website) {
      // Honeypot tripped — silently accept without sending.
      return;
    }

    const apiKey = this.config.get<string>('EMAIL_PROVIDER_KEY');
    const fromAddress = this.config.get<string>('EMAIL_FROM_ADDRESS');

    const lines = [
      `Name: ${dto.name}`,
      `Business: ${dto.businessName}`,
      `Email: ${dto.email}`,
      dto.phone ? `Phone: ${dto.phone}` : null,
      dto.businessType ? `Business type: ${dto.businessType}` : null,
      dto.message ? `Message:\n${dto.message}` : null,
    ].filter(Boolean);

    try {
      const response = await axios.post<{ id: string }>(
        'https://api.resend.com/emails',
        {
          from: fromAddress,
          to: SALES_INBOX,
          reply_to: dto.email,
          subject: `New demo request — ${dto.businessName}`,
          text: lines.join('\n\n'),
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      this.logger.debug(
        `Demo request emailed, provider_ref=${response.data.id}`,
      );
    } catch (err) {
      // Never let the raw provider error (which can include the server token in the request
      // config) reach the client — log the full submission so the lead isn't silently lost,
      // and surface a plain message the visitor can act on.
      this.logger.error(
        `Failed to email demo request for ${dto.email} (${dto.businessName})`,
        err instanceof Error ? err.stack : err,
      );
      this.logger.error(`Undelivered demo request:\n${lines.join('\n')}`);
      throw new InternalServerErrorException(
        "We couldn't send your request just now — please try again in a moment, or email us directly at sales@noxtill.com.",
      );
    }
  }
}
