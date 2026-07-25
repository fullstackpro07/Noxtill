"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketingModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const campaigns_service_1 = require("./campaigns.service");
const referrals_service_1 = require("./referrals.service");
const competitors_service_1 = require("./competitors.service");
const campaigns_controller_1 = require("./campaigns.controller");
const referrals_controller_1 = require("./referrals.controller");
const competitors_controller_1 = require("./competitors.controller");
const competitor_snapshot_scheduler_1 = require("./jobs/competitor-snapshot.scheduler");
const competitor_snapshot_processor_1 = require("./jobs/competitor-snapshot.processor");
const marketing_constants_1 = require("./marketing.constants");
const messaging_module_1 = require("../messaging/messaging.module");
const customers_module_1 = require("../customers/customers.module");
let MarketingModule = class MarketingModule {
};
exports.MarketingModule = MarketingModule;
exports.MarketingModule = MarketingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: marketing_constants_1.COMPETITOR_SNAPSHOT_QUEUE }),
            messaging_module_1.MessagingModule,
            customers_module_1.CustomersModule,
        ],
        controllers: [
            campaigns_controller_1.CampaignsController,
            referrals_controller_1.ReferralsController,
            competitors_controller_1.CompetitorsController,
        ],
        providers: [
            campaigns_service_1.CampaignsService,
            referrals_service_1.ReferralsService,
            competitors_service_1.CompetitorsService,
            competitor_snapshot_scheduler_1.CompetitorSnapshotScheduler,
            competitor_snapshot_processor_1.CompetitorSnapshotProcessor,
        ],
    })
], MarketingModule);
//# sourceMappingURL=marketing.module.js.map