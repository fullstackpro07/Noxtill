"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const inventory_service_1 = require("./inventory.service");
const stock_count_service_1 = require("./stock-count.service");
const inventory_controller_1 = require("./inventory.controller");
const low_stock_scan_scheduler_1 = require("./low-stock-scan.scheduler");
const low_stock_scan_processor_1 = require("./low-stock-scan.processor");
const low_stock_scan_constants_1 = require("./low-stock-scan.constants");
const messaging_module_1 = require("../messaging/messaging.module");
const activity_module_1 = require("../activity/activity.module");
const automations_module_1 = require("../marketing/automations/automations.module");
let InventoryModule = class InventoryModule {
};
exports.InventoryModule = InventoryModule;
exports.InventoryModule = InventoryModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: low_stock_scan_constants_1.LOW_STOCK_SCAN_QUEUE }),
            messaging_module_1.MessagingModule,
            activity_module_1.ActivityModule,
            automations_module_1.AutomationsModule,
        ],
        controllers: [inventory_controller_1.InventoryController],
        providers: [
            inventory_service_1.InventoryService,
            stock_count_service_1.StockCountService,
            low_stock_scan_scheduler_1.LowStockScanScheduler,
            low_stock_scan_processor_1.LowStockScanProcessor,
        ],
        exports: [inventory_service_1.InventoryService],
    })
], InventoryModule);
//# sourceMappingURL=inventory.module.js.map