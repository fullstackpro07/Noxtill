import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;

/**
 * Sessions (UPD-BE-040) — one real row per login, replacing the old single `User.refreshTokenHash`
 * column. `AuthService` uses this internally for issue/refresh/logout; `SessionsController`
 * exposes the real list + individual revoke.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the row first (with a placeholder hash) so its real id can be embedded in the JWT before the refresh token — which needs that same id — is even signed. */
  create(
    userId: string,
    businessId: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    return this.prisma.session.create({
      data: { userId, businessId, refreshTokenHash: '', userAgent, ipAddress },
    });
  }

  async setRefreshTokenHash(sessionId: string, refreshToken: string) {
    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { refreshTokenHash, lastUsedAt: new Date() },
    });
  }

  async findActive(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.revokedAt) return null;
    return session;
  }

  async verifyRefreshToken(
    sessionId: string,
    refreshToken: string,
  ): Promise<boolean> {
    const session = await this.findActive(sessionId);
    if (!session) return false;
    return bcrypt.compare(refreshToken, session.refreshTokenHash);
  }

  async revoke(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  list(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /** Only the session's own owner may revoke it — never trusts a bare id from another user. */
  async revokeOwn(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }
    await this.revoke(sessionId);
  }
}
