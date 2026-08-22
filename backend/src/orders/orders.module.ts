import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { InvoiceService } from './invoice.service';
import { HeldSalesService } from './held-sales.service';
import { VoiceSaleService } from './voice-sale.service';
import { TablesService } from './tables.service';
import { ReturnsService } from './returns.service';
import { OrdersController } from './orders.controller';
import { HeldSalesController } from './held-sales.controller';
import { VoiceSaleController } from './voice-sale.controller';
import { TablesController } from './tables.controller';
import { ReturnsController } from './returns.controller';
import { SalesHistoryService } from './sales-history.service';
import { SalesHistoryController } from './sales-history.controller';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { ReceiptsService } from './receipts.service';
import { ReceiptsController } from './receipts.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { MarketingModule } from '../marketing/marketing.module';
import { ActivityModule } from '../activity/activity.module';
import { CashRegisterModule } from '../cash-register/cash-register.module';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { CustomersModule } from '../customers/customers.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MessagingModule,
    ReviewsModule,
    MarketingModule,
    ActivityModule,
    CashRegisterModule,
    AiModule,
    BillingModule,
    CustomersModule,
    SettingsModule,
  ],
  controllers: [
    OrdersController,
    HeldSalesController,
    VoiceSaleController,
    TablesController,
    ReturnsController,
    SalesHistoryController,
    InvoicesController,
    ReceiptsController,
  ],
  providers: [
    OrdersService,
    InvoiceService,
    HeldSalesService,
    VoiceSaleService,
    TablesService,
    ReturnsService,
    SalesHistoryService,
    InvoicesService,
    ReceiptsService,
  ],
  exports: [OrdersService, InvoiceService],
})
export class OrdersModule {}
