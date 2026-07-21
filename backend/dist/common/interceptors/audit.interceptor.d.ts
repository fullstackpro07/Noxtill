import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { AuditService } from '../audit/audit.service';
export declare class AuditInterceptor implements NestInterceptor {
    private readonly reflector;
    private readonly auditService;
    constructor(reflector: Reflector, auditService: AuditService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
}
