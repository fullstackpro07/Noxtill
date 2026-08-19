import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeyAuthService } from '../../developer/api-key-auth.service';
import { API_KEY_PREFIX } from '../../developer/api-key.constants';
import type { RequestWithUser } from '../tenancy/auth-context';

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
      const user = await this.apiKeyAuth.authenticate(rawKey);
      if (!user) {
        throw new UnauthorizedException('Invalid or revoked API key');
      }
      request.user = user;
      return true;
    }

    return super.canActivate(context) as boolean;
  }
}
