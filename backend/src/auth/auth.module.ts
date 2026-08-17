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

@Module({
  imports: [PassportModule, JwtModule.register({}), MessagingModule],
  controllers: [AuthController, SessionsController],
  providers: [AuthService, SessionsService, TwoFactorService, JwtStrategy],
  exports: [AuthService, SessionsService],
})
export class AuthModule {}
