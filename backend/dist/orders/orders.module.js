"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersModule = void 0;
const common_1 = require("@nestjs/common");
const orders_service_1 = require("./orders.service");
const invoice_service_1 = require("./invoice.service");
const held_sales_service_1 = require("./held-sales.service");
const voice_sale_service_1 = require("./voice-sale.service");
const tables_service_1 = require("./tables.service");
const returns_service_1 = require("./returns.service");
const orders_controller_1 = require("./orders.controller");
const held_sales_controller_1 = require("./held-sales.controller");
const voice_sale_controller_1 = require("./voice-sale.controller");
const tables_controller_1 = require("./tables.controller");
const returns_controller_1 = require("./returns.controller");
const messaging_module_1 = require("../messaging/messaging.module");
const reviews_module_1 = require("../reviews/reviews.module");
const marketing_module_1 = require("../marketing/marketing.module");
const activity_module_1 = require("../activity/activity.module");
const cash_register_module_1 = require("../cash-register/cash-register.module");
const ai_module_1 = require("../ai/ai.module");
const billing_module_1 = require("../billing/billing.module");
let OrdersModule = class OrdersModule {
};
exports.OrdersModule = OrdersModule;
exports.OrdersModule = OrdersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            messaging_module_1.MessagingModule,
            reviews_module_1.ReviewsModule,
            marketing_module_1.MarketingModule,
            activity_module_1.ActivityModule,
            cash_register_module_1.CashRegisterModule,
            ai_module_1.AiModule,
            billing_module_1.BillingModule,
        ],
        controllers: [
            orders_controller_1.OrdersController,
            held_sales_controller_1.HeldSalesController,
            voice_sale_controller_1.VoiceSaleController,
            tables_controller_1.TablesController,
            returns_controller_1.ReturnsController,
        ],
        providers: [
            orders_service_1.OrdersService,
            invoice_service_1.InvoiceService,
            held_sales_service_1.HeldSalesService,
            voice_sale_service_1.VoiceSaleService,
            tables_service_1.TablesService,
            returns_service_1.ReturnsService,
        ],
        exports: [orders_service_1.OrdersService, invoice_service_1.InvoiceService],
    })
], OrdersModule);
//# sourceMappingURL=orders.module.js.map