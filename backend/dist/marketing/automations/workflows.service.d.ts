import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/create-workflow.dto';
import { Prisma, WorkflowTriggerKey } from '../../../generated/prisma';
export declare class WorkflowsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(businessId: string, dto: CreateWorkflowDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "Workflow", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        active: boolean;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        conditions: Prisma.JsonValue;
        actions: Prisma.JsonValue;
    }>;
    list(triggerKey?: WorkflowTriggerKey): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        active: boolean;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        conditions: Prisma.JsonValue;
        actions: Prisma.JsonValue;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        active: boolean;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        conditions: Prisma.JsonValue;
        actions: Prisma.JsonValue;
    }>;
    update(id: string, dto: UpdateWorkflowDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        active: boolean;
        triggerKey: import("../../../generated/prisma").$Enums.WorkflowTriggerKey;
        conditions: Prisma.JsonValue;
        actions: Prisma.JsonValue;
    }>;
    remove(id: string): Promise<void>;
    listRuns(workflowId: string): Promise<{
        error: string | null;
        id: string;
        createdAt: Date;
        result: Prisma.JsonValue | null;
        businessId: string;
        status: import("../../../generated/prisma").$Enums.WorkflowRunStatus;
        workflowId: string;
        context: Prisma.JsonValue;
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
        wouldExecuteActions: Prisma.JsonValue;
    }>;
}
