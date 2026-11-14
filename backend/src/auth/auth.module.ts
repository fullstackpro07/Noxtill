import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { AuthMailerService } from './auth-mailer.service';
import { AuthTokensService } from './auth-tokens.service';
import { AccountService } from './account.service';
import { SignInMethodsService } from './sign-in-methods.service';
import { SocialAuthService } from './oauth/social-auth.service';
import { PasskeysService } from './passkeys/passkeys.service';
import { PasskeysController } from './passkeys/passkeys.controller';
import { MfaService } from './mfa/mfa.service';
import { PasswordService } from './security/password.service';
import { AuthRateLimitService } from './security/auth-rate-limit.service';
import { TurnstileService } from './security/turnstile.service';

/**
 * Authentication (auth security spec v1.0). Sessions are opaque HttpOnly-cookie tokens resolved by
 * the global guard in `common/guards/jwt-auth.guard.ts`; JWTs are only used for short-lived,
 * non-session sign-in tickets.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, SessionsController, PasskeysController],
  providers: [
    AuthService,
    SessionsService,
    AuthMailerService,
    AuthTokensService,
    AccountService,
    SignInMethodsService,
    SocialAuthService,
    PasskeysService,
    MfaService,
    PasswordService,
    AuthRateLimitService,
    TurnstileService,
  ],
  exports: [
    AuthService,
    SessionsService,
    AuthTokensService,
    PasswordService,
    MfaService,
  ],
})
export class AuthModule {}
