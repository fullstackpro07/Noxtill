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
var WorkflowTriggerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowTriggerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const send_gate_service_1 = require("../../messaging/send-gate.service");
const workflow_condition_util_1 = require("./workflow-condition.util");
const workflow_context_util_1 = require("./workflow-context.util");
const workflow_trigger_map_util_1 = require("./workflow-trigger-map.util");
const workflows_constants_1 = require("./workflows.constants");
const prisma_1 = require("../../../generated/prisma");
let WorkflowTriggerService = WorkflowTriggerService_1 = class WorkflowTriggerService {
    prisma;
    sendGate;
    logger = new common_1.Logger(WorkflowTriggerService_1.name);
    constructor(prisma, sendGate) {
        this.prisma = prisma;
        this.sendGate = sendGate;
    }
    async dispatch(businessId, type, event) {
        const triggerKey = (0, workflow_trigger_map_util_1.mapActivityEventToTriggerKey)(type, event.description);
        if (!triggerKey)
            return;
        const workflows = await this.prisma.workflow.findMany({
            where: { businessId, triggerKey, active: true },
        });
        if (workflows.length === 0)
            return;
        const context = await (0, workflow_context_util_1.buildTriggerContext)(this.prisma, triggerKey, event);
        for (const workflow of workflows) {
            await this.runWorkflow(businessId, workflow, context).catch((error) => this.logger.warn(`Workflow ${workflow.id} run failed for business ${businessId}: ${error.message}`));
        }
    }
    async runWorkflow(businessId, workflow, context) {
        const conditions = (workflow.conditions ??
            []);
        const matched = (0, workflow_condition_util_1.evaluateConditions)(conditions, context);
        if (!matched) {
            await this.prisma.workflowRun.create({
                data: {
                    workflowId: workflow.id,
                    businessId,
                    status: prisma_1.WorkflowRunStatus.skipped,
                    context: context,
                },
            });
            return;
        }
        const actions = (workflow.actions ?? []);
        try {
            const result = await this.executeActions(businessId, actions, context);
            await this.prisma.workflowRun.create({
                data: {
                    workflowId: workflow.id,
                    businessId,
                    status: prisma_1.WorkflowRunStatus.success,
                    context: context,
                    result: result,
                },
            });
        }
        catch (error) {
            await this.prisma.workflowRun.create({
                data: {
                    workflowId: workflow.id,
                    businessId,
                    status: prisma_1.WorkflowRunStatus.failed,
                    context: context,
                    error: error.message,
                },
            });
        }
    }
    async executeActions(businessId, actions, context) {
        const results = [];
        for (const action of actions) {
            if (action.type === 'send_customer_message') {
                const customerId = context.customerId;
                if (!customerId) {
                    results.push({
                        type: action.type,
                        skipped: true,
                        reason: 'no customer in context',
                    });
                    continue;
                }
                try {
                    await this.sendGate.send({
                        businessId,
                        customerId,
                        templateKey: workflows_constants_1.AUTOMATION_MESSAGE_TEMPLATE_KEY,
                        variables: { body: action.messageBody },
                    });
                    results.push({ type: action.type, sent: true, customerId });
                }
                catch (error) {
                    results.push({
                        type: action.type,
                        sent: false,
                        error: error.message,
                    });
                }
            }
            else if (action.type === 'notify_owner') {
                const owner = await this.prisma.businessUser.findFirst({
                    where: { businessId, role: prisma_1.Role.owner },
                    include: { user: true },
                });
                if (!owner) {
                    results.push({
                        type: action.type,
                        skipped: true,
                        reason: 'no owner found',
                    });
                    continue;
                }
                try {
                    await this.sendGate.send({
                        businessId,
                        templateKey: workflows_constants_1.AUTOMATION_MESSAGE_TEMPLATE_KEY,
                        to: {
                            phone: owner.user.phone ?? undefined,
                            email: owner.user.email ?? undefined,
                        },
                        variables: { body: action.messageBody },
                    });
                    results.push({ type: action.type, sent: true });
                }
                catch (error) {
                    results.push({
                        type: action.type,
                        sent: false,
                        error: error.message,
                    });
                }
            }
        }
        return results;
    }
};
exports.WorkflowTriggerService = WorkflowTriggerService;
exports.WorkflowTriggerService = WorkflowTriggerService = WorkflowTriggerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        send_gate_service_1.SendGateService])
], WorkflowTriggerService);
//# sourceMappingURL=workflow-trigger.service.js.map