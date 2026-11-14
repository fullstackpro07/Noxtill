import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SecurityEventsService } from '../common/security/security-events.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { PasswordService } from './security/password.service';
import { SessionsService } from './sessions.service';
import { AuthMailerService } from './auth-mailer.service';
import { MfaService } from './mfa/mfa.service';

/** A sign-in counts as "fresh" for this long after it happened. */
export const FRESH_AUTH_MINUTES = 15;
const STEP_UP_MS = 10 * 60_000;

/**
 * Guards for changing how someone signs in (spec §3.4, §5.4): fresh authentication before any
 * change; never removing the last way in (a passkey alone never counts — device loss is common);
 * and every removal revokes all sessions, is audited and is emailed to the account.
 */
@Injectable()
export class SignInMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly mfa: MfaService,
    @Optional() private readonly mailer?: AuthMailerService,
    @Optional() private readonly securityEvents?: SecurityEventsService,
  ) {}

  /**
   * Passes when the current session was created within the last 15 minutes, was stepped-up within
   * the last 10, or the current password is supplied and correct. Refresh rotation keeps the same
   * session row, so a long-lived session does not count as fresh.
   */
  async assertFreshAuth(user: AuthenticatedUser, password?: string) {
    if (password) {
      const u = await this.prisma.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: { passwordHash: true, hasPassword: true },
      });
      if (
        u.hasPassword &&
        (await this.passwords.verify(u.passwordHash, password))
      )
        return;
      throw new AppException(
        'INVALID_PASSWORD',
        "That password isn't right.",
        HttpStatus.UNAUTHORIZED,
      );
    }
    const session = user.sessionId
      ? await this.prisma.session.findUnique({
          where: { id: user.sessionId },
          select: {
            createdAt: true,
            revokedAt: true,
            userId: true,
            stepUpAt: true,
          },
        })
      : null;
    const now = Date.now();
    const fresh =
      session &&
      !session.revokedAt &&
      session.userId === user.sub &&
      (now - session.createdAt.getTime() <= FRESH_AUTH_MINUTES * 60_000 ||
        (session.stepUpAt && now - session.stepUpAt.getTime() <= STEP_UP_MS));
    if (!fresh) {
      throw new AppException(
        'REAUTH_REQUIRED',
        'For your security, confirm it’s you to change sign-in methods.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /** Ways in that don't depend on a single device: a usable password and active provider identities. */
  async independentMethods(userId: string, except: { provider?: string } = {}) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
        emailVerifiedAt: true,
        phone: true,
        hasPassword: true,
      },
    });
    const password =
      user.hasPassword &&
      ((user.email && user.emailVerifiedAt) || (!user.email && user.phone))
        ? 1
        : 0;
    const identities = await this.prisma.authIdentity.count({
      where: {
        userId,
        disabledAt: null,
        ...(except.provider ? { provider: { not: except.provider } } : {}),
      },
    });
    return password + identities;
  }

  async assertCanRemove(
    userId: string,
    removing: { provider?: string; passkeyId?: string },
  ) {
    if (
      removing.provider &&
      (await this.independentMethods(userId, removing)) === 0
    ) {
      throw new AppException(
        'LAST_SIGN_IN_METHOD',
        'This is your only way to sign in. Set a password or connect another account first.',
        HttpStatus.CONFLICT,
      );
    }
    if (removing.passkeyId) {
      const status = await this.mfa.status(userId);
      if (status.required && !status.totp && status.passkeys <= 1) {
        throw new AppException(
          'MFA_REQUIRED',
          'Your account must keep a second factor. Set up an authenticator app before removing your last passkey.',
          HttpStatus.CONFLICT,
        );
      }
    }
  }

  /** Mandatory follow-up of any removal: revoke all sessions, audit, notify (§3.4, §9.3). */
  async afterRemoval(
    userId: string,
    what: {
      type: 'identity_unlinked' | 'passkey_removed';
      label: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await this.sessions.revokeAllForUser(userId, 'sign_in_method_removed');
    await this.securityEvents?.record({
      type: what.type,
      userId,
      metadata: what.metadata,
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user?.email) {
      await this.mailer?.sendNotice(user.email, {
        subject: 'A sign-in method was removed from your Noxtill account',
        heading: 'Sign-in method removed',
        body: `${what.label} was removed from your Noxtill account and every device was signed out. If this wasn’t you, reset your password and review your account security.`,
        cta: 'Review account security',
        path: '/settings/tools/security',
        footnote:
          'You’re receiving this because of a security event on your Noxtill account.',
      });
    }
  }
}
