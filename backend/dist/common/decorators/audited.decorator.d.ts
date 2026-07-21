export declare const AUDIT_KEY = "audit";
export interface AuditMeta {
    action: string;
    entity: string;
}
export declare const Audited: (action: string, entity: string) => import("@nestjs/common").CustomDecorator<string>;
