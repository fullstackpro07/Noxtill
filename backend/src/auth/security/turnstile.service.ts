import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppException } from '../../common/filters/app.exception';

/**
 * Bot challenge (spec §10.2), verified server-side with Cloudflare Turnstile. Active only when
 * TURNSTILE_SECRET_KEY is configured (the frontend shows the widget when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set). Without keys it is a no-op — disclosed in
 * docs/AUTHENTICATION.md rather than silently claimed.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    return !!this.config.get<string>('TURNSTILE_SECRET_KEY');
  }

  async assert(token: string | undefined, ip?: string): Promise<void> {
    if (!this.enabled()) return;
    const fail = () =>
      new AppException(
        'BOT_CHECK_FAILED',
        'Please complete the security check and try again.',
        HttpStatus.BAD_REQUEST,
      );
    if (!token) throw fail();
    try {
      const res = await axios.post<{ success?: boolean }>(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        new URLSearchParams({
          secret: this.config.get<string>('TURNSTILE_SECRET_KEY')!,
          response: token,
          ...(ip ? { remoteip: ip } : {}),
        }).toString(),
        {
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          timeout: 5000,
        },
      );
      if (!res.data.success) throw fail();
    } catch (err) {
      if (err instanceof AppException) throw err;
      this.logger.warn('Turnstile verification unreachable');
      throw fail();
    }
  }
}
