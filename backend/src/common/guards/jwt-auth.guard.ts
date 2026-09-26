import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  ApiKeyAuthService,
  ApiKeyRateLimitedException,
} from '../../developer/api-key-auth.service';
import { API_KEY_PREFIX } from '../../developer/api-key.constants';
import type {
  AuthenticatedUser,
  RequestWithUser,
} from '../tenancy/auth-context';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyAuth: ApiKeyAuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Real API-key auth (UPD-BE-081) — a `Bearer ntk_...` token is never a valid JWT, so it must
    // be branched off before Passport's JWT strategy tries (and fails) to parse it as one.
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith(`Bearer ${API_KEY_PREFIX}`)) {
      const rawKey = authHeader.slice('Bearer '.length);
      let user: AuthenticatedUser | null;
      try {
        user = await this.apiKeyAuth.authenticate(rawKey);
      } catch (error) {
        if (error instanceof ApiKeyRateLimitedException) {
          context
            .switchToHttp()
            .getResponse<Response>()
            .setHeader('Retry-After', String(error.retryAfterSeconds));
        }
        throw error;
      }
      if (!user) {
        throw new UnauthorizedException('Invalid or revoked API key');
      }
      request.user = user;
      return true;
    }

    return super.canActivate(context) as boolean;
  }
}
