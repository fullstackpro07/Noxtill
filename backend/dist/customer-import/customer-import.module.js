"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerImportModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const customer_import_service_1 = require("./customer-import.service");
const customer_import_parser_1 = require("./customer-import.parser");
const customer_import_controller_1 = require("./customer-import.controller");
const customer_import_processor_1 = require("./customer-import.processor");
const customer_import_constants_1 = require("./customer-import.constants");
const ai_module_1 = require("../ai/ai.module");
let CustomerImportModule = class CustomerImportModule {
};
exports.CustomerImportModule = CustomerImportModule;
exports.CustomerImportModule = CustomerImportModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: customer_import_constants_1.CUSTOMER_IMPORT_QUEUE }),
            ai_module_1.AiModule,
        ],
        controllers: [customer_import_controller_1.CustomerImportController],
        providers: [
            customer_import_service_1.CustomerImportService,
            customer_import_parser_1.CustomerImportParser,
            customer_import_processor_1.CustomerImportProcessor,
        ],
    })
], CustomerImportModule);
//# sourceMappingURL=customer-import.module.js.map