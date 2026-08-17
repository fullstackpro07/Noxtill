"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationsModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const workflows_service_1 = require("./workflows.service");
const workflows_controller_1 = require("./workflows.controller");
const workflow_trigger_service_1 = require("./workflow-trigger.service");
const credit_overdue_scan_scheduler_1 = require("./jobs/credit-overdue-scan.scheduler");
const credit_overdue_scan_processor_1 = require("./jobs/credit-overdue-scan.processor");
const workflows_constants_1 = require("./workflows.constants");
const messaging_module_1 = require("../../messaging/messaging.module");
let AutomationsModule = class AutomationsModule {
};
exports.AutomationsModule = AutomationsModule;
exports.AutomationsModule = AutomationsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: workflows_constants_1.CREDIT_OVERDUE_SCAN_QUEUE }),
            messaging_module_1.MessagingModule,
        ],
        controllers: [workflows_controller_1.WorkflowsController],
        providers: [
            workflows_service_1.WorkflowsService,
            workflow_trigger_service_1.WorkflowTriggerService,
            credit_overdue_scan_scheduler_1.CreditOverdueScanScheduler,
            credit_overdue_scan_processor_1.CreditOverdueScanProcessor,
        ],
        exports: [workflow_trigger_service_1.WorkflowTriggerService],
    })
], AutomationsModule);
//# sourceMappingURL=automations.module.js.map