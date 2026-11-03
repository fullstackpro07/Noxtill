import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { OrdersModule } from '../orders/orders.module';
import { CommerceModule } from '../commerce/commerce.module';
import { CustomersModule } from '../customers/customers.module';
import { MessagingModule } from '../messaging/messaging.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { PaymentsModule } from '../payments/payments.module';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerPortalSupportService } from './customer-portal-support.service';
import { CustomerPortalPaymentsService } from './customer-portal-payments.service';

@Module({
  imports: [
    BookingsModule,
    OrdersModule,
    CommerceModule,
    CustomersModule,
    MessagingModule,
    HelpdeskModule,
    PaymentsModule,
  ],
  controllers: [CustomerPortalController],
  providers: [
    CustomerPortalService,
    CustomerPortalSupportService,
    CustomerPortalPaymentsService,
  ],
})
export class CustomerPortalModule {}
