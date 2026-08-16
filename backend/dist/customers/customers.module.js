"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomersModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const customers_controller_1 = require("./customers.controller");
const customers_service_1 = require("./customers.service");
const segments_controller_1 = require("./segments.controller");
const segments_service_1 = require("./segments.service");
const loyalty_controller_1 = require("./loyalty.controller");
const loyalty_service_1 = require("./loyalty.service");
const memberships_controller_1 = require("./memberships.controller");
const memberships_service_1 = require("./memberships.service");
const memory_notes_controller_1 = require("./memory-notes.controller");
const memory_notes_service_1 = require("./memory-notes.service");
const crm_jobs_scheduler_1 = require("./jobs/crm-jobs.scheduler");
const crm_jobs_processor_1 = require("./jobs/crm-jobs.processor");
const crm_jobs_constants_1 = require("./jobs/crm-jobs.constants");
const messaging_module_1 = require("../messaging/messaging.module");
const billing_module_1 = require("../billing/billing.module");
const automations_module_1 = require("../marketing/automations/automations.module");
let CustomersModule = class CustomersModule {
};
exports.CustomersModule = CustomersModule;
exports.CustomersModule = CustomersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: crm_jobs_constants_1.CRM_JOBS_QUEUE }),
            messaging_module_1.MessagingModule,
            billing_module_1.BillingModule,
            automations_module_1.AutomationsModule,
        ],
        controllers: [
            customers_controller_1.CustomersController,
            segments_controller_1.SegmentsController,
            loyalty_controller_1.LoyaltyController,
            memberships_controller_1.MembershipsController,
            memory_notes_controller_1.MemoryNotesController,
        ],
        providers: [
            customers_service_1.CustomersService,
            segments_service_1.SegmentsService,
            crm_jobs_scheduler_1.CrmJobsScheduler,
            crm_jobs_processor_1.CrmJobsProcessor,
            loyalty_service_1.LoyaltyService,
            memberships_service_1.MembershipsService,
            memory_notes_service_1.MemoryNotesService,
        ],
        exports: [customers_service_1.CustomersService, segments_service_1.SegmentsService, loyalty_service_1.LoyaltyService],
    })
], CustomersModule);
//# sourceMappingURL=customers.module.js.map