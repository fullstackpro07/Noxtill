import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action: string;
  entity: string;
}

/** Marks a handler as a financial mutation that must be append-only audit-logged (BE-009). */
export const Audited = (action: string, entity: string) =>
  SetMetadata(AUDIT_KEY, { action, entity });
