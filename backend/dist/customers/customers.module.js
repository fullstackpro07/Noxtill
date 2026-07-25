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
const crm_jobs_scheduler_1 = require("./jobs/crm-jobs.scheduler");
const crm_jobs_processor_1 = require("./jobs/crm-jobs.processor");
const crm_jobs_constants_1 = require("./jobs/crm-jobs.constants");
const messaging_module_1 = require("../messaging/messaging.module");
let CustomersModule = class CustomersModule {
};
exports.CustomersModule = CustomersModule;
exports.CustomersModule = CustomersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: crm_jobs_constants_1.CRM_JOBS_QUEUE }),
            messaging_module_1.MessagingModule,
        ],
        controllers: [customers_controller_1.CustomersController, segments_controller_1.SegmentsController],
        providers: [
            customers_service_1.CustomersService,
            segments_service_1.SegmentsService,
            crm_jobs_scheduler_1.CrmJobsScheduler,
            crm_jobs_processor_1.CrmJobsProcessor,
        ],
        exports: [customers_service_1.CustomersService, segments_service_1.SegmentsService],
    })
], CustomersModule);
//# sourceMappingURL=customers.module.js.map