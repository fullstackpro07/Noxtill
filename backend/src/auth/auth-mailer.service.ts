import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface AuthEmail {
  to: string;
  subject: string;
  heading: string;
  body: string;
  cta: string;
  url: string;
  footnote: string;
}

/**
 * Transactional auth emails (confirm email, reset password) — sent through Resend, the same provider
 * `EmailService` and the Legal & Trust forms already use. When the provider isn't configured (local
 * dev) the link is logged instead, so the flow stays testable; the caller is told it wasn't sent.
 */
@Injectable()
export class AuthMailerService {
  private readonly logger = new Logger(AuthMailerService.name);

  constructor(private readonly config: ConfigService) {}

  frontendUrl(path: string): string {
    const base = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    return `${base}${path}`;
  }

  sendVerifyEmail(to: string, url: string) {
    return this.send({
      to,
      subject: 'Confirm your Noxtill email',
      heading: 'Confirm your email',
      body: 'Thanks for creating a Noxtill account. Confirm this address to continue setting up your business workspace.',
      cta: 'Confirm email',
      url,
      footnote:
        "This link expires in 24 hours. If you didn't create a Noxtill account, you can ignore this email.",
    });
  }

  sendPasswordReset(to: string, url: string) {
    return this.send({
      to,
      subject: 'Reset your Noxtill password',
      heading: 'Reset your password',
      body: 'We received a request to reset the password for this Noxtill account.',
      cta: 'Set a new password',
      url,
      footnote:
        "This link expires in 30 minutes and can be used once. If you didn't ask for a reset, you can ignore this email — your password stays the same.",
    });
  }

  /** Returns true when the provider accepted the email. Never throws the provider's raw error (it carries the API key). */
  private async send(mail: AuthEmail): Promise<boolean> {
    const apiKey = this.config.get<string>('EMAIL_PROVIDER_KEY');
    const from = this.config.get<string>('EMAIL_FROM_ADDRESS');
    if (!apiKey || !from) {
      this.logger.warn(
        `Email provider not configured — "${mail.subject}" for ${mail.to}: ${mail.url}`,
      );
      return false;
    }
    try {
      await axios.post(
        'https://api.resend.com/emails',
        {
          from,
          to: mail.to,
          subject: mail.subject,
          text: `${mail.heading}\n\n${mail.body}\n\n${mail.cta}: ${mail.url}\n\n${mail.footnote}`,
          html: renderHtml(mail),
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to deliver "${mail.subject}" to ${mail.to}`,
        err instanceof Error ? err.message : undefined,
      );
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        this.logger.warn(`Undelivered link for ${mail.to}: ${mail.url}`);
      }
      return false;
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(m: AuthEmail): string {
  const url = escapeHtml(m.url);
  return `<!doctype html><html><body style="margin:0;background:#F6F8FA;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:470px;background:#fff;border:1px solid #ECEFF3;border-radius:22px;padding:40px 36px">
<tr><td style="font-size:26px;font-weight:800;letter-spacing:-.02em;text-align:center;padding-bottom:10px">${escapeHtml(m.heading)}</td></tr>
<tr><td style="font-size:16px;line-height:1.55;color:#64748B;text-align:center;padding-bottom:26px">${escapeHtml(m.body)}</td></tr>
<tr><td align="center" style="padding-bottom:22px"><a href="${url}" style="display:inline-block;background:#0B6E3B;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 32px;border-radius:12px">${escapeHtml(m.cta)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#94A3B8;text-align:center">${escapeHtml(m.footnote)}<br><br>Or paste this link into your browser:<br><span style="color:#0B6E3B;word-break:break-all">${url}</span></td></tr>
</table>
<p style="font-size:12px;color:#94A3B8;margin-top:18px">©2026 Noxtill LLC. All Rights Reserved.</p>
</td></tr></table></body></html>`;
}
