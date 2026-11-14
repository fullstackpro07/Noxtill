import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { SessionsService } from './sessions.service';
import { AuthTokensService } from './auth-tokens.service';
import { MfaService } from './mfa/mfa.service';
import { PasswordService } from './security/password.service';
import { AuthRateLimitService } from './security/auth-rate-limit.service';

describe('AuthService (DI wiring)', () => {
  it('resolves with its real constructor dependencies', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: CapabilitiesService, useValue: {} },
        { provide: SessionsService, useValue: {} },
        { provide: MfaService, useValue: {} },
        { provide: AuthTokensService, useValue: {} },
        { provide: PasswordService, useValue: {} },
        { provide: AuthRateLimitService, useValue: {} },
      ],
    }).compile();
    expect(module.get(AuthService)).toBeDefined();
  });
});
