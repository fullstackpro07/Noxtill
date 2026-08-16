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
var ActivityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const activity_pubsub_service_1 = require("./activity-pubsub.service");
const workflow_trigger_service_1 = require("../marketing/automations/workflow-trigger.service");
const activity_constants_1 = require("./activity.constants");
let ActivityService = ActivityService_1 = class ActivityService {
    tenantPrisma;
    pubsub;
    workflowTrigger;
    logger = new common_1.Logger(ActivityService_1.name);
    constructor(tenantPrisma, pubsub, workflowTrigger) {
        this.tenantPrisma = tenantPrisma;
        this.pubsub = pubsub;
        this.workflowTrigger = workflowTrigger;
    }
    async record(businessId, input) {
        try {
            const event = await this.tenantPrisma.client.activityEvent.create({
                data: { businessId, ...input },
            });
            await this.pubsub.publish((0, activity_constants_1.activityChannel)(businessId), this.toPayload(event));
            void this.workflowTrigger
                ?.dispatch(businessId, input.type, {
                description: input.description,
                entityType: input.entityType,
                entityId: input.entityId,
                amount: input.amount,
            })
                .catch((error) => this.logger.warn(`Workflow dispatch failed for activity event (${input.type}) on business ${businessId}: ${error.message}`));
        }
        catch (error) {
            this.logger.warn(`Failed to record activity event (${input.type}) for business ${businessId}: ${error.message}`);
        }
    }
    async getRecentHistory(businessId, limit = activity_constants_1.ACTIVITY_HISTORY_BACKFILL) {
        const events = await this.tenantPrisma.client.activityEvent.findMany({
            where: { businessId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return events.reverse().map((event) => this.toPayload(event));
    }
    stream(businessId) {
        const history$ = new rxjs_1.Observable((subscriber) => {
            this.getRecentHistory(businessId)
                .then((events) => {
                for (const event of events)
                    subscriber.next(event);
                subscriber.complete();
            })
                .catch((error) => subscriber.error(error));
        });
        const live$ = this.pubsub.subscribe((0, activity_constants_1.activityChannel)(businessId));
        return (0, rxjs_1.concat)(history$, live$).pipe((0, rxjs_1.map)((event) => ({ data: event, type: event.type })));
    }
    toPayload(event) {
        return {
            id: event.id,
            type: event.type,
            description: event.description,
            amount: event.amount === null ? null : Number(event.amount),
            entityType: event.entityType,
            entityId: event.entityId,
            actorUserId: event.actorUserId,
            createdAt: event.createdAt.toISOString(),
        };
    }
};
exports.ActivityService = ActivityService;
exports.ActivityService = ActivityService = ActivityService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        activity_pubsub_service_1.ActivityPubSubService,
        workflow_trigger_service_1.WorkflowTriggerService])
], ActivityService);
//# sourceMappingURL=activity.service.js.map