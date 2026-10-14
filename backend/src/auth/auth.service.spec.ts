import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { SessionsService } from './sessions.service';
import { TwoFactorService } from './two-factor.service';
import { AuthTokensService } from './auth-tokens.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: CapabilitiesService, useValue: {} },
        { provide: SessionsService, useValue: {} },
        { provide: TwoFactorService, useValue: {} },
        { provide: AuthTokensService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
