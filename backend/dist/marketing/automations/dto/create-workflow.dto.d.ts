import { WorkflowTriggerKey } from '../../../../generated/prisma';
export declare class CreateWorkflowDto {
    name: string;
    triggerKey: WorkflowTriggerKey;
    conditions?: Record<string, unknown>[];
    actions?: Record<string, unknown>[];
}
export declare class UpdateWorkflowDto {
    name?: string;
    conditions?: Record<string, unknown>[];
    actions?: Record<string, unknown>[];
    active?: boolean;
}
