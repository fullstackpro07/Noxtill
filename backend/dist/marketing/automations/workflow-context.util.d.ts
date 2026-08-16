import { WorkflowTriggerKey } from '../../../generated/prisma';
export interface TriggerEvent {
    description: string;
    entityType?: string | null;
    entityId?: string | null;
    amount?: number | null;
}
export interface ContextReader {
    order: {
        findUnique(args: {
            where: {
                id: string;
            };
        }): Promise<{
            customerId: string | null;
            total: unknown;
            orderNo: number;
        } | null>;
    };
    appointment: {
        findUnique(args: {
            where: {
                id: string;
            };
            include: {
                service: {
                    select: {
                        name: true;
                    };
                };
            };
        }): Promise<{
            customerId: string;
            service: {
                name: string;
            };
        } | null>;
    };
    reviewRequest: {
        findUnique(args: {
            where: {
                id: string;
            };
        }): Promise<{
            customerId: string | null;
            stars: number | null;
        } | null>;
    };
    customer: {
        findUnique(args: {
            where: {
                id: string;
            };
        }): Promise<{
            name: string;
        } | null>;
    };
    installment: {
        findUnique(args: {
            where: {
                id: string;
            };
            include: {
                plan: {
                    select: {
                        customerId: true;
                    };
                };
            };
        }): Promise<{
            amount: unknown;
            plan: {
                customerId: string;
            };
        } | null>;
    };
}
export declare function buildTriggerContext(reader: ContextReader, triggerKey: WorkflowTriggerKey, event: TriggerEvent): Promise<Record<string, unknown>>;
