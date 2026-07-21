"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nestjs_cls_1 = require("nestjs-cls");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const businesses_module_1 = require("./businesses/businesses.module");
const customers_module_1 = require("./customers/customers.module");
const ai_module_1 = require("./ai/ai.module");
const whatsapp_module_1 = require("./whatsapp/whatsapp.module");
const prisma_module_1 = require("./prisma/prisma.module");
const common_module_1 = require("./common/common.module");
const queue_module_1 = require("./common/queue/queue.module");
const storage_module_1 = require("./common/storage/storage.module");
const localization_module_1 = require("./common/localization/localization.module");
const pdf_module_1 = require("./common/pdf/pdf.module");
const messaging_module_1 = require("./messaging/messaging.module");
const webhooks_module_1 = require("./webhooks/webhooks.module");
const nightly_close_module_1 = require("./nightly-close/nightly-close.module");
const products_module_1 = require("./products/products.module");
const orders_module_1 = require("./orders/orders.module");
const quotations_module_1 = require("./quotations/quotations.module");
const public_ordering_module_1 = require("./public-ordering/public-ordering.module");
const credit_module_1 = require("./credit/credit.module");
const inventory_module_1 = require("./inventory/inventory.module");
const expenses_module_1 = require("./expenses/expenses.module");
const profit_module_1 = require("./profit/profit.module");
const customer_import_module_1 = require("./customer-import/customer-import.module");
const reviews_module_1 = require("./reviews/reviews.module");
const bookings_module_1 = require("./bookings/bookings.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            nestjs_cls_1.ClsModule.forRoot({ global: true, middleware: { mount: true } }),
            prisma_module_1.PrismaModule,
            common_module_1.CommonModule,
            queue_module_1.QueueModule,
            storage_module_1.StorageModule,
            localization_module_1.LocalizationModule,
            pdf_module_1.PdfModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            businesses_module_1.BusinessesModule,
            customers_module_1.CustomersModule,
            ai_module_1.AiModule,
            whatsapp_module_1.WhatsappModule,
            messaging_module_1.MessagingModule,
            webhooks_module_1.WebhooksModule,
            nightly_close_module_1.NightlyCloseModule,
            products_module_1.ProductsModule,
            orders_module_1.OrdersModule,
            quotations_module_1.QuotationsModule,
            public_ordering_module_1.PublicOrderingModule,
            credit_module_1.CreditModule,
            inventory_module_1.InventoryModule,
            expenses_module_1.ExpensesModule,
            profit_module_1.ProfitModule,
            customer_import_module_1.CustomerImportModule,
            reviews_module_1.ReviewsModule,
            bookings_module_1.BookingsModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map