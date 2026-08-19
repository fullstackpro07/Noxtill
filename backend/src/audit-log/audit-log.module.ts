import { Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';

/** `AuditService` is provided globally by `CommonModule` — nothing else to wire here. */
@Module({
  controllers: [AuditLogController],
})
export class AuditLogModule {}
