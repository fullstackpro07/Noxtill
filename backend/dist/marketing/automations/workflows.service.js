"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../../common/filters/app.exception");
const workflows_constants_1 = require("./workflows.constants");
const workflow_condition_util_1 = require("./workflow-condition.util");
const workflow_context_util_1 = require("./workflow-context.util");
const workflow_trigger_map_util_1 = require("./workflow-trigger-map.util");
let WorkflowsService = class WorkflowsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    create(businessId, dto) {
        return this.tenantPrisma.client.workflow.create({
            data: {
                businessId,
                name: dto.name,
                triggerKey: dto.triggerKey,
                conditions: (dto.conditions ?? []),
                actions: (dto.actions ?? []),
            },
        });
    }
    list(triggerKey) {
        return this.tenantPrisma.client.workflow.findMany({
            where: { triggerKey },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id) {
        const workflow = await this.tenantPrisma.client.workflow.findUnique({
            where: { id },
        });
        if (!workflow) {
            throw new app_exception_1.AppException(workflows_constants_1.WORKFLOW_ERROR_CODES.NOT_FOUND, 'Workflow not found', common_1.HttpStatus.NOT_FOUND);
        }
        return workflow;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.tenantPrisma.client.workflow.update({
            where: { id },
            data: {
                name: dto.name,
                conditions: dto.conditions !== undefined
                    ? dto.conditions
                    : undefined,
                actions: dto.actions !== undefined
                    ? dto.actions
                    : undefined,
                active: dto.active,
            },
        });
    }
    async remove(id) {
        await this.findOne(id);
        await this.tenantPrisma.client.workflow.delete({ where: { id } });
    }
    async listRuns(workflowId) {
        await this.findOne(workflowId);
        return this.tenantPrisma.client.workflowRun.findMany({
            where: { workflowId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
    async test(id) {
        const workflow = await this.findOne(id);
        const recentEvents = await this.tenantPrisma.client.activityEvent.findMany({
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
        const matchingEvent = recentEvents.find((event) => (0, workflow_trigger_map_util_1.mapActivityEventToTriggerKey)(event.type, event.description) ===
            workflow.triggerKey);
        if (!matchingEvent) {
            return {
                workflowId: workflow.id,
                triggerKey: workflow.triggerKey,
                foundRecentEvent: false,
                matched: false,
                context: null,
                wouldExecuteActions: [],
            };
        }
        const context = await (0, workflow_context_util_1.buildTriggerContext)(this.tenantPrisma.client, workflow.triggerKey, {
            description: matchingEvent.description,
            entityType: matchingEvent.entityType,
            entityId: matchingEvent.entityId,
            amount: matchingEvent.amount ? Number(matchingEvent.amount) : undefined,
        });
        const conditions = (workflow.conditions ??
            []);
        const matched = (0, workflow_condition_util_1.evaluateConditions)(conditions, context);
        return {
            workflowId: workflow.id,
            triggerKey: workflow.triggerKey,
            foundRecentEvent: true,
            sourceEventId: matchingEvent.id,
            matched,
            context,
            wouldExecuteActions: matched ? workflow.actions : [],
        };
    }
};
exports.WorkflowsService = WorkflowsService;
exports.WorkflowsService = WorkflowsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], WorkflowsService);
//# sourceMappingURL=workflows.service.js.map