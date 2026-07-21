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
var CustomerImportProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerImportProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const customer_import_service_1 = require("./customer-import.service");
const customer_import_constants_1 = require("./customer-import.constants");
let CustomerImportProcessor = CustomerImportProcessor_1 = class CustomerImportProcessor extends bullmq_1.WorkerHost {
    importService;
    logger = new common_1.Logger(CustomerImportProcessor_1.name);
    constructor(importService) {
        super();
        this.importService = importService;
    }
    async process(job) {
        await this.importService.executeBatch(job.data.businessId, job.data.batchId);
        this.logger.debug(`Customer import batch ${job.data.batchId} executed`);
    }
};
exports.CustomerImportProcessor = CustomerImportProcessor;
exports.CustomerImportProcessor = CustomerImportProcessor = CustomerImportProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(customer_import_constants_1.CUSTOMER_IMPORT_QUEUE),
    __metadata("design:paramtypes", [customer_import_service_1.CustomerImportService])
], CustomerImportProcessor);
//# sourceMappingURL=customer-import.processor.js.map