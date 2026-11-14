import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountService } from './account.service';
import { SocialAuthService } from './oauth/social-auth.service';
import { MfaService } from './mfa/mfa.service';
import { SignInMethodsService } from './sign-in-methods.service';
import { TurnstileService } from './security/turnstile.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            signup: jest.fn(),
            login: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
          },
        },
        { provide: AccountService, useValue: {} },
        { provide: SocialAuthService, useValue: {} },
        { provide: MfaService, useValue: {} },
        { provide: SignInMethodsService, useValue: {} },
        { provide: TurnstileService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
