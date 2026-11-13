import { HttpStatus, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

/** A sign-in counts as "fresh" for this long after it happened (auth spec §4.3 / §6.5). */
export const FRESH_AUTH_MINUTES = 15;

/**
 * Shared guards for changing how someone signs in: linking/unlinking a provider, adding/removing a
 * passkey. Both need fresh authentication, and none may remove the last way back into the account.
 */
@Injectable()
export class SignInMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Passes when the current session was created (= the user actually authenticated) within the last
   * 15 minutes, or when the current password is supplied and correct. Refresh-token rotation keeps
   * the same session row, so a long-lived session does not count as fresh.
   */
  async assertFreshAuth(user: AuthenticatedUser, password?: string) {
    if (password) {
      const u = await this.prisma.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: { passwordHash: true },
      });
      if (await bcrypt.compare(password, u.passwordHash)) return;
      throw new AppException(
        'INVALID_PASSWORD',
        "That password isn't right.",
        HttpStatus.UNAUTHORIZED,
      );
    }
    const session = user.sessionId
      ? await this.prisma.session.findUnique({
          where: { id: user.sessionId },
          select: { createdAt: true, revokedAt: true, userId: true },
        })
      : null;
    const fresh =
      session &&
      !session.revokedAt &&
      session.userId === user.sub &&
      Date.now() - session.createdAt.getTime() <= FRESH_AUTH_MINUTES * 60_000;
    if (!fresh) {
      throw new AppException(
        'REAUTH_REQUIRED',
        'For your security, confirm your password (or sign in again) to change sign-in methods.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * Never allow removing the only remaining way back in (auth spec §4.3 / §6.5). A verified email
   * always remains a way back (password reset), as does a phone-only password account; otherwise
   * another linked provider or passkey must remain.
   */
  async assertCanRemove(
    userId: string,
    removing: { provider?: string; passkeyId?: string },
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true, phone: true },
    });
    if (user.email && user.emailVerifiedAt) return;
    if (!user.email && user.phone) return;
    const [identities, passkeys] = await Promise.all([
      this.prisma.authIdentity.count({
        where: {
          userId,
          ...(removing.provider
            ? { provider: { not: removing.provider } }
            : {}),
        },
      }),
      this.prisma.passkeyCredential.count({
        where: {
          userId,
          ...(removing.passkeyId ? { id: { not: removing.passkeyId } } : {}),
        },
      }),
    ]);
    if (identities + passkeys === 0) {
      throw new AppException(
        'LAST_SIGN_IN_METHOD',
        'This is your only way to sign in. Add another sign-in method or confirm your email first.',
        HttpStatus.CONFLICT,
      );
    }
  }
}
