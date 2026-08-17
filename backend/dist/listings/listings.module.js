"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListingsModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const master_listing_service_1 = require("./master-listing.service");
const listing_sync_service_1 = require("./listing-sync.service");
const gmb_management_service_1 = require("./gmb-management.service");
const gmb_insights_scheduler_1 = require("./gmb-insights.scheduler");
const gmb_insights_processor_1 = require("./gmb-insights.processor");
const listings_controller_1 = require("./listings.controller");
const listings_constants_1 = require("./listings.constants");
const integrations_module_1 = require("../integrations/integrations.module");
let ListingsModule = class ListingsModule {
};
exports.ListingsModule = ListingsModule;
exports.ListingsModule = ListingsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: listings_constants_1.GMB_INSIGHTS_QUEUE }),
            integrations_module_1.IntegrationsModule,
        ],
        controllers: [listings_controller_1.ListingsController],
        providers: [
            master_listing_service_1.MasterListingService,
            listing_sync_service_1.ListingSyncService,
            gmb_management_service_1.GmbManagementService,
            gmb_insights_scheduler_1.GmbInsightsScheduler,
            gmb_insights_processor_1.GmbInsightsProcessor,
        ],
        exports: [master_listing_service_1.MasterListingService, listing_sync_service_1.ListingSyncService, gmb_management_service_1.GmbManagementService],
    })
], ListingsModule);
//# sourceMappingURL=listings.module.js.map