import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/create-workflow.dto';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { WorkflowTriggerKey } from '../../../generated/prisma';
export declare class WorkflowsController {
    private readonly workflows;
    constructor(workflows: WorkflowsService);
    create(user: AuthenticatedUser, dto: CreateWorkflowDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("../../../generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "Workflow", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        conditions: import("generated/prisma/runtime/library").JsonValue;
        actions: import("generated/prisma/runtime/library").JsonValue;
    }>;
    list(triggerKey?: WorkflowTriggerKey): import("generated/prisma/runtime/library").PrismaPromise<{
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        conditions: import("generated/prisma/runtime/library").JsonValue;
        actions: import("generated/prisma/runtime/library").JsonValue;
    }[]>;
    findOne(id: string): Promise<{
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        conditions: import("generated/prisma/runtime/library").JsonValue;
        actions: import("generated/prisma/runtime/library").JsonValue;
    }>;
    update(id: string, dto: UpdateWorkflowDto): Promise<{
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        conditions: import("generated/prisma/runtime/library").JsonValue;
        actions: import("generated/prisma/runtime/library").JsonValue;
    }>;
    remove(id: string): Promise<void>;
    listRuns(id: string): Promise<{
        error: string | null;
        id: string;
        businessId: string;
        createdAt: Date;
        result: import("generated/prisma/runtime/library").JsonValue | null;
        status: import("../../../generated/prisma").$Enums.WorkflowRunStatus;
        workflowId: string;
        context: import("generated/prisma/runtime/library").JsonValue;
    }[]>;
    test(id: string): Promise<{
        workflowId: string;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        foundRecentEvent: boolean;
        matched: boolean;
        context: null;
        wouldExecuteActions: never[];
        sourceEventId?: undefined;
    } | {
        workflowId: string;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        foundRecentEvent: boolean;
        sourceEventId: string;
        matched: boolean;
        context: Record<string, unknown>;
        wouldExecuteActions: import("generated/prisma/runtime/library").JsonValue;
    }>;
}
