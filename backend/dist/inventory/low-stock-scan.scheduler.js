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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var LowStockScanScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LowStockScanScheduler = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const low_stock_scan_constants_1 = require("./low-stock-scan.constants");
let LowStockScanScheduler = LowStockScanScheduler_1 = class LowStockScanScheduler {
    queue;
    logger = new common_1.Logger(LowStockScanScheduler_1.name);
    constructor(queue) {
        this.queue = queue;
    }
    onModuleInit() {
        this.queue
            .add('tick', {}, {
            repeat: { pattern: '0 * * * *' },
            jobId: 'low-stock-scan-hourly-tick',
        })
            .catch((error) => this.logger.error(`Failed to register low-stock scan tick: ${error.message}`));
    }
};
exports.LowStockScanScheduler = LowStockScanScheduler;
exports.LowStockScanScheduler = LowStockScanScheduler = LowStockScanScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(low_stock_scan_constants_1.LOW_STOCK_SCAN_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], LowStockScanScheduler);
//# sourceMappingURL=low-stock-scan.scheduler.js.map