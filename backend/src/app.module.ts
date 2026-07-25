import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BusinessesModule } from './businesses/businesses.module';
import { CustomersModule } from './customers/customers.module';
import { AiModule } from './ai/ai.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { QueueModule } from './common/queue/queue.module';
import { StorageModule } from './common/storage/storage.module';
import { LocalizationModule } from './common/localization/localization.module';
import { PdfModule } from './common/pdf/pdf.module';
import { MessagingModule } from './messaging/messaging.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { NightlyCloseModule } from './nightly-close/nightly-close.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { QuotationsModule } from './quotations/quotations.module';
import { PublicOrderingModule } from './public-ordering/public-ordering.module';
import { CreditModule } from './credit/credit.module';
import { InventoryModule } from './inventory/inventory.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ProfitModule } from './profit/profit.module';
import { CustomerImportModule } from './customer-import/customer-import.module';
import { ReviewsModule } from './reviews/reviews.module';
import { BookingsModule } from './bookings/bookings.module';
import { StaffModule } from './staff/staff.module';
import { BranchesModule } from './branches/branches.module';
import { MarketingModule } from './marketing/marketing.module';
import { BillingModule } from './billing/billing.module';
import { WidgetsModule } from './widgets/widgets.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BusinessTypesModule } from './business-types/business-types.module';
import { SearchModule } from './search/search.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { HelpModule } from './help/help.module';
import { AssistantModule } from './assistant/assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule,
    CommonModule,
    QueueModule,
    StorageModule,
    LocalizationModule,
    PdfModule,
    AuthModule,
    UsersModule,
    BusinessesModule,
    CustomersModule,
    AiModule,
    WhatsappModule,
    MessagingModule,
    WebhooksModule,
    NightlyCloseModule,
    ProductsModule,
    OrdersModule,
    QuotationsModule,
    PublicOrderingModule,
    CreditModule,
    InventoryModule,
    ExpensesModule,
    ProfitModule,
    CustomerImportModule,
    ReviewsModule,
    BookingsModule,
    StaffModule,
    BranchesModule,
    MarketingModule,
    BillingModule,
    WidgetsModule,
    DashboardModule,
    BusinessTypesModule,
    SearchModule,
    AnalyticsModule,
    PlatformAdminModule,
    HelpModule,
    AssistantModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
