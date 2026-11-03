import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/** Persist tenant-scoped control-plane latency without tokens, query strings or request bodies. */
@Injectable()
export class VoiceControlMetricsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: { businessId?: string };
      route?: { path?: string };
      method: string;
    }>();
    const businessId = request.user?.businessId;
    if (!businessId) return next.handle(); // Public hooks are measured through their saved call sessions.
    const started = performance.now();
    let saved = false;
    const record = (failed: boolean) => {
      if (saved) return;
      saved = true;
      void this.prisma.voiceUsageRecord
        .create({
          data: {
            businessId,
            eventKey: `control:${randomUUID()}`,
            provider: 'noxtill',
            unit: 'control_request_latency_ms',
            quantity: Math.max(0, performance.now() - started),
            state: 'observed',
            evidence: {
              route: request.route?.path ?? 'voice',
              method: request.method,
              failed,
            },
          },
        })
        .catch(() => undefined); // Telemetry must never change the call command result.
    };
    return next.handle().pipe(
      tap({ complete: () => record(false) }),
      catchError((error: unknown) => {
        record(true);
        return throwError(() => error);
      }),
    );
  }
}
