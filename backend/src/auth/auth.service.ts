import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { HttpStatus } from '@nestjs/common';
import { slugify } from '../common/utils/slug.util';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { SessionsService } from './sessions.service';
import { TwoFactorService } from './two-factor.service';
import {
  PENDING_2FA_TTL_MINUTES,
  TWO_FACTOR_ERROR_CODES,
} from './two-factor.constants';
import { Prisma, Role } from '@prisma/client';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/** A real, fully-authenticated login. */
export interface LoginSuccess extends TokenPair {
  user: PublicUser;
}

/** 2FA is enabled — a real code was just sent, exchange it via `verifyTwoFactorLogin`. */
export interface Pending2fa {
  pending2fa: true;
  tempToken: string;
}

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly capabilities: CapabilitiesService,
    private readonly sessions: SessionsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async signup(dto: SignupDto, meta: RequestMeta = {}) {
    const identityFilters: Prisma.UserWhereInput[] = [];
    if (dto.email) identityFilters.push({ email: dto.email });
    if (dto.phone) identityFilters.push({ phone: dto.phone });

    const existing = await this.prisma.user.findFirst({
      where: { OR: identityFilters },
    });
    if (existing) {
      throw new AppException(
        'ACCOUNT_EXISTS',
        'This email already has an account — log in instead',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, business, businessUser } = await this.prisma.$transaction(
      async (tx) => {
        const business = await tx.business.create({
          data: {
            name: dto.businessName,
            slug: slugify(dto.businessName),
            country: dto.country,
            currency: dto.currency ?? 'USD',
            locale: dto.locale ?? 'en',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });

        const user = await tx.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            passwordHash,
          },
        });

        const businessUser = await tx.businessUser.create({
          data: { businessId: business.id, userId: user.id, role: Role.owner },
        });

        return { user, business, businessUser };
      },
    );

    const tokens = await this.issueTokens(
      user.id,
      business.id,
      businessUser.role,
      businessUser.customRoleId,
      meta,
    );
    return { business, user: this.toPublicUser(user), ...tokens };
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta = {},
  ): Promise<LoginSuccess | Pending2fa> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.emailOrPhone }, { phone: dto.emailOrPhone }] },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException(
        'ACCOUNT_LOCKED',
        `Too many failed attempts — try again after ${user.lockedUntil.toISOString()}`,
        HttpStatus.FORBIDDEN,
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    const businessUser = await this.prisma.businessUser.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!businessUser) {
      throw new UnauthorizedException(
        'No business associated with this account',
      );
    }

    if (user.twoFactorEnabled) {
      if (!user.phone) {
        throw new AppException(
          TWO_FACTOR_ERROR_CODES.NO_IDENTITY,
          '2FA is enabled but this account has no phone number to send a code to',
          HttpStatus.CONFLICT,
        );
      }
      await this.twoFactor.generateAndSend(
        user.id,
        businessUser.businessId,
        user.phone,
      );
      const tempToken = await this.issuePendingTwoFactorToken(user.id);
      return { pending2fa: true as const, tempToken };
    }

    const tokens = await this.issueTokens(
      user.id,
      businessUser.businessId,
      businessUser.role,
      businessUser.customRoleId,
      meta,
    );
    return { user: this.toPublicUser(user), ...tokens };
  }

  /** Completes a 2FA-gated login — exchanges a real, verified code + pending token for real tokens. */
  async verifyTwoFactorLogin(
    tempToken: string,
    code: string,
    meta: RequestMeta = {},
  ): Promise<LoginSuccess> {
    let payload: { sub: string; pending2fa: boolean };
    try {
      payload = await this.jwt.verifyAsync(tempToken, {
        secret: this.pendingTwoFactorSecret(),
      });
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired verification session — log in again',
      );
    }
    if (!payload.pending2fa) {
      throw new UnauthorizedException(
        'Invalid or expired verification session — log in again',
      );
    }

    await this.twoFactor.verify(payload.sub, code);

    const businessUser = await this.prisma.businessUser.findFirst({
      where: { userId: payload.sub },
      orderBy: { createdAt: 'asc' },
    });
    if (!businessUser) {
      throw new UnauthorizedException(
        'No business associated with this account',
      );
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
    });

    const tokens = await this.issueTokens(
      user.id,
      businessUser.businessId,
      businessUser.role,
      businessUser.customRoleId,
      meta,
    );
    return { user: this.toPublicUser(user), ...tokens };
  }

  async enableTwoFactor(userId: string, businessId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.twoFactorEnabled) {
      throw new AppException(
        TWO_FACTOR_ERROR_CODES.ALREADY_ENABLED,
        '2FA is already enabled',
        HttpStatus.CONFLICT,
      );
    }
    if (!user.phone) {
      throw new AppException(
        TWO_FACTOR_ERROR_CODES.NO_IDENTITY,
        'A phone number is required to enable WhatsApp 2FA',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.twoFactor.generateAndSend(userId, businessId, user.phone);
    return { sent: true };
  }

  async confirmTwoFactor(userId: string, code: string) {
    await this.twoFactor.verify(userId, code);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
    return { enabled: true };
  }

  async disableTwoFactor(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppException(
        TWO_FACTOR_ERROR_CODES.WRONG_PASSWORD,
        'Incorrect password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });
    return { enabled: false };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: {
      sub: string;
      businessId: string;
      role: Role;
      sessionId?: string;
    };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.sessionId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const validHash = await this.sessions.verifyRefreshToken(
      payload.sessionId,
      refreshToken,
    );
    if (!validHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Re-fetched fresh (not trusted from the old token's payload) so a role or custom-role
    // change picks up the real current capability set on the next refresh, not just re-login.
    const businessUser = await this.prisma.businessUser.findFirst({
      where: { userId: payload.sub, businessId: payload.businessId },
    });
    if (!businessUser) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const capabilities = await this.capabilities.resolve({
      role: businessUser.role,
      customRoleId: businessUser.customRoleId,
    });
    const newPayload = {
      sub: payload.sub,
      businessId: payload.businessId,
      role: businessUser.role,
      capabilities,
      sessionId: payload.sessionId,
    };

    const accessToken = await this.jwt.signAsync(newPayload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') ??
        '15m') as unknown as number,
    });
    const newRefreshToken = await this.jwt.signAsync(newPayload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.config.get<string>('JWT_REFRESH_TTL') ??
        '7d') as unknown as number,
    });
    await this.sessions.setRefreshTokenHash(payload.sessionId, newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /** Revokes only the session the caller is currently using — every other device stays logged in. */
  async logout(sessionId?: string) {
    if (!sessionId) return;
    await this.sessions.revoke(sessionId);
  }

  private async registerFailedAttempt(userId: string, currentAttempts: number) {
    const maxAttempts = Number(this.config.get('LOGIN_MAX_ATTEMPTS') ?? 5);
    const lockMinutes = Number(this.config.get('LOGIN_LOCK_MINUTES') ?? 15);
    const attempts = currentAttempts + 1;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil:
          attempts >= maxAttempts
            ? new Date(Date.now() + lockMinutes * 60 * 1000)
            : undefined,
      },
    });
  }

  private async issueTokens(
    userId: string,
    businessId: string,
    role: Role,
    customRoleId: string | null,
    meta: RequestMeta = {},
  ): Promise<TokenPair> {
    const capabilities = await this.capabilities.resolve({
      role,
      customRoleId,
    });

    // Created first (with a placeholder hash) so its real id can be embedded in the token
    // payload before the refresh token — which needs that same id — is even signed.
    const session = await this.sessions.create(
      userId,
      businessId,
      meta.userAgent,
      meta.ipAddress,
    );

    const payload = {
      sub: userId,
      businessId,
      role,
      capabilities,
      sessionId: session.id,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') ??
        '15m') as unknown as number,
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.config.get<string>('JWT_REFRESH_TTL') ??
        '7d') as unknown as number,
    });

    await this.sessions.setRefreshTokenHash(session.id, refreshToken);

    return { accessToken, refreshToken };
  }

  private async issuePendingTwoFactorToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, pending2fa: true },
      {
        secret: this.pendingTwoFactorSecret(),
        expiresIn: `${PENDING_2FA_TTL_MINUTES}m`,
      },
    );
  }

  /** Deliberately distinct from `JWT_SECRET` (derived, not a new required env var) so a pending-2FA
   * token can never pass the normal `JwtStrategy`'s verification and reach a real protected route. */
  private pendingTwoFactorSecret(): string {
    return `${this.config.get<string>('JWT_SECRET')}:pending2fa`;
  }

  private toPublicUser(user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    };
  }
}
