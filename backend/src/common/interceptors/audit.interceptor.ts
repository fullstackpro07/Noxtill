import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_KEY, AuditMeta } from '../decorators/audited.decorator';
import { AuditService } from '../audit/audit.service';

function extractId(value: unknown): string | undefined {
  if (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return (value as { id: string }).id;
  }
  return undefined;
}

/**
 * Global interceptor (BE-009): no-ops unless the handler carries `@Audited(action, entity)`
 * metadata, so it's safe to register once for the whole app. On a successful
 * response it logs `after` from the returned payload; handlers that need a
 * real `before` snapshot (e.g. balance-affecting mutations) should call
 * AuditService.log directly instead so before/after are captured atomically
 * with the mutation itself.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      tap((result: unknown) => {
        const paramId = request.params?.id;
        const entityId =
          extractId(result) ??
          (typeof paramId === 'string' ? paramId : undefined);
        if (!entityId) {
          return;
        }
        void this.auditService.log({
          entity: meta.entity,
          action: meta.action,
          entityId,
          after: result,
        });
      }),
    );
  }
}
