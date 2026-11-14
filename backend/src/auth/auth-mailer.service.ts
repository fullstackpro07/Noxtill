import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface AuthEmail {
  to: string;
  subject: string;
  heading: string;
  body: string;
  /** Link emails: button + pasteable URL. */
  cta?: string;
  url?: string;
  /** Code emails: a one-time code shown large instead of a button. */
  code?: string;
  footnote: string;
  /** Secret-free description used in log lines (subjects can contain the code). */
  label: string;
}

/**
 * Transactional auth emails (email verification code, reset password link) — sent through Resend, the
 * same provider `EmailService` and the Legal & Trust forms already use. When the provider isn't
 * configured the caller is told it wasn't sent; codes and links are never written to logs.
 */
@Injectable()
export class AuthMailerService {
  private readonly logger = new Logger(AuthMailerService.name);
  /** Last verification code per address, so dev (no email provider) can still finish signup. */
  private readonly devVerifyCodes = new Map<string, string>();

  constructor(private readonly config: ConfigService) {}

  getLatestDevVerifyCode(email: string): string | undefined {
    return this.devVerifyCodes.get(email.toLowerCase());
  }

  frontendUrl(path: string): string {
    const base = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    return `${base}${path}`;
  }

  sendVerifyCode(to: string, code: string, ttlMinutes: number) {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.devVerifyCodes.set(to.toLowerCase(), code);
    }
    return this.send({
      to,
      subject: `${code} is your Noxtill verification code`,
      heading: 'Confirm your email',
      body: 'Thanks for creating a Noxtill account. Enter this code on the verification screen to continue setting up your business workspace.',
      code,
      label: 'email verification code',
      footnote: `This code expires in ${ttlMinutes} minutes and can be used once. Never share it with anyone. If you didn't create a Noxtill account, you can ignore this email.`,
    });
  }

  /** New-device sign-in and provider-link confirmation codes (spec §3.1, §7.3). */
  sendSignInCode(
    to: string,
    code: string,
    ttlMinutes: number,
    purpose: 'login_device' | 'link_email',
  ) {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.devVerifyCodes.set(to.toLowerCase(), code);
    }
    const link = purpose === 'link_email';
    return this.send({
      to,
      subject: link
        ? `${code} is your code to connect a sign-in method`
        : `${code} is your Noxtill sign-in code`,
      heading: link ? 'Confirm it’s you' : 'Sign-in from a new device',
      body: link
        ? 'Someone is trying to connect a new sign-in method to the Noxtill account for this email. Enter this code to confirm it was you.'
        : 'Your password was entered correctly on a device we haven’t seen before. Enter this code to finish signing in.',
      code,
      label: link ? 'link confirmation code' : 'new-device sign-in code',
      footnote: `This code expires in ${ttlMinutes} minutes and can be used once. Never share it. If this wasn't you, change your password — someone may know it.`,
    });
  }

  sendPasswordReset(to: string, url: string, ttlMinutes = 15) {
    return this.send({
      to,
      subject: 'Reset your Noxtill password',
      heading: 'Reset your password',
      body: 'We received a request to reset the password for this Noxtill account.',
      cta: 'Set a new password',
      url,
      label: 'password reset link',
      footnote: `This link expires in ${ttlMinutes} minutes and can be used once. If you didn't ask for a reset, you can ignore this email — your password stays the same.`,
    });
  }

  /** Account notices (usage alerts, trial reminders) — same transport and template as auth mail. */
  sendNotice(
    to: string,
    notice: {
      subject: string;
      heading: string;
      body: string;
      cta: string;
      path: string;
      footnote: string;
    },
  ) {
    return this.send({
      to,
      subject: notice.subject,
      heading: notice.heading,
      body: notice.body,
      cta: notice.cta,
      url: this.frontendUrl(notice.path),
      footnote: notice.footnote,
      label: notice.subject,
    });
  }

  /** Returns true when the provider accepted the email. Never throws the provider's raw error (it carries the API key). */
  private async send(mail: AuthEmail): Promise<boolean> {
    const apiKey = this.config.get<string>('EMAIL_PROVIDER_KEY');
    // Auth mail goes out on its own transactional sender/subdomain (spec §6.4), separate from
    // anything marketing sends; falls back to the shared sender until one is configured.
    const configuredFrom =
      this.config.get<string>('AUTH_EMAIL_FROM_ADDRESS') ||
      this.config.get<string>('EMAIL_FROM_ADDRESS');
    if (!apiKey || !configuredFrom) {
      // Never log the code or link itself (spec §11) — dev reads codes from the check-email screen.
      this.logger.warn(
        `Email provider not configured — ${mail.label} not sent`,
      );
      return false;
    }
    const action = mail.code
      ? `Your code: ${mail.code}`
      : `${mail.cta}: ${mail.url}`;

    const postEmail = (fromAddress: string) =>
      axios.post(
        'https://api.resend.com/emails',
        {
          from: fromAddress,
          to: mail.to,
          subject: mail.subject,
          text: `${mail.heading}\n\n${mail.body}\n\n${action}\n\n${mail.footnote}`,
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

    let deliveryError: unknown = null;
    try {
      await postEmail(configuredFrom);
      return true;
    } catch (err: unknown) {
      deliveryError = err;
      const axiosErr = err as {
        response?: { status?: number; data?: { message?: string } };
      };
      const status = axiosErr?.response?.status;
      const msg = axiosErr?.response?.data?.message ?? '';

      // When the configured domain isn't authorized in Resend yet (dev/staging), fallback to onboarding@resend.dev
      if (
        status === 403 &&
        msg.includes('not authorized to send emails from') &&
        configuredFrom !== 'onboarding@resend.dev'
      ) {
        this.logger.warn(
          `Domain not authorized for "${configuredFrom}" — retrying with onboarding@resend.dev`,
        );
        try {
          await postEmail('onboarding@resend.dev');
          return true;
        } catch (retryErr) {
          deliveryError = retryErr;
        }
      }

      this.logger.error(
        `Failed to deliver ${mail.label}`,
        deliveryError instanceof Error ? deliveryError.message : undefined,
      );
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
  const action = m.code
    ? `<tr><td align="center" style="padding-bottom:22px"><div style="display:inline-block;background:#F1FBF5;border:1px solid #DEF0E6;border-radius:14px;padding:16px 28px;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:34px;font-weight:800;letter-spacing:.32em;color:#0B6E3B">${escapeHtml(m.code)}</div></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#94A3B8;text-align:center">${escapeHtml(m.footnote)}</td></tr>`
    : `<tr><td align="center" style="padding-bottom:22px"><a href="${escapeHtml(m.url ?? '')}" style="display:inline-block;background:#0B6E3B;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 32px;border-radius:12px">${escapeHtml(m.cta ?? '')}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#94A3B8;text-align:center">${escapeHtml(m.footnote)}<br><br>Or paste this link into your browser:<br><span style="color:#0B6E3B;word-break:break-all">${escapeHtml(m.url ?? '')}</span></td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#F6F8FA;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:470px;background:#fff;border:1px solid #ECEFF3;border-radius:22px;padding:40px 36px">
<tr><td style="font-size:26px;font-weight:800;letter-spacing:-.02em;text-align:center;padding-bottom:10px">${escapeHtml(m.heading)}</td></tr>
<tr><td style="font-size:16px;line-height:1.55;color:#64748B;text-align:center;padding-bottom:26px">${escapeHtml(m.body)}</td></tr>
${action}
</table>
<p style="font-size:12px;color:#94A3B8;margin-top:18px">©2026 Noxtill LLC. All Rights Reserved.</p>
</td></tr></table></body></html>`;
}
