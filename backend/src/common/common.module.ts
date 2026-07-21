import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenancyGuard } from './tenancy/tenancy.guard';
import { RolesGuard } from './guards/roles.guard';
import { BusinessThrottlerGuard } from './guards/business-throttler.guard';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { AuditService } from './audit/audit.service';
import { WebhookIdempotencyService } from './webhooks/webhook-idempotency.service';

/**
 * Wires the global request pipeline in guard-execution order (BE-006/008/009/013):
 * 1. BusinessThrottlerGuard — reject spam before doing any auth work
 * 2. JwtAuthGuard            — verify the token, populate request.user (bypassed by @Public())
 * 3. TenancyGuard            — bind businessId/userId/role into CLS from request.user
 * 4. RolesGuard              — enforce @Roles(...) route gates
 * Then AuditInterceptor (no-ops without @Audited(...)) and HttpExceptionFilter
 * normalize every response/error.
 */
@Global()
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  providers: [
    AuditService,
    WebhookIdempotencyService,
    { provide: APP_GUARD, useClass: BusinessThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenancyGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [AuditService, WebhookIdempotencyService],
})
export class CommonModule {}
