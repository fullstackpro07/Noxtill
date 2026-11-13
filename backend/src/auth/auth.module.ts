import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { TwoFactorService } from './two-factor.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MessagingModule } from '../messaging/messaging.module';
import { AuthMailerService } from './auth-mailer.service';
import { AuthTokensService } from './auth-tokens.service';
import { AccountService } from './account.service';
import { SignInMethodsService } from './sign-in-methods.service';
import { SocialAuthService } from './oauth/social-auth.service';
import { PasskeysService } from './passkeys/passkeys.service';
import { PasskeysController } from './passkeys/passkeys.controller';

@Module({
  imports: [PassportModule, JwtModule.register({}), MessagingModule],
  controllers: [AuthController, SessionsController, PasskeysController],
  providers: [
    AuthService,
    SessionsService,
    TwoFactorService,
    JwtStrategy,
    AuthMailerService,
    AuthTokensService,
    AccountService,
    SignInMethodsService,
    SocialAuthService,
    PasskeysService,
  ],
  exports: [AuthService, SessionsService, AuthTokensService],
})
export class AuthModule {}
