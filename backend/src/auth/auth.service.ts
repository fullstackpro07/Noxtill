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
import { Prisma, Role } from '../../generated/prisma';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async signup(dto: SignupDto) {
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
    );
    return { business, user: this.toPublicUser(user), ...tokens };
  }

  async login(dto: LoginDto) {
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

    const tokens = await this.issueTokens(
      user.id,
      businessUser.businessId,
      businessUser.role,
      businessUser.customRoleId,
    );
    return { user: this.toPublicUser(user), ...tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; businessId: string; role: Role };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) {
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

    return this.issueTokens(
      payload.sub,
      payload.businessId,
      businessUser.role,
      businessUser.customRoleId,
    );
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
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
  ): Promise<TokenPair> {
    const capabilities = await this.capabilities.resolve({ role, customRoleId });
    const payload = { sub: userId, businessId, role, capabilities };

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

    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });

    return { accessToken, refreshToken };
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
