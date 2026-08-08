import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { InvoiceService } from './invoice.service';
import { OrdersController } from './orders.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { MarketingModule } from '../marketing/marketing.module';

@Module({
  imports: [MessagingModule, ReviewsModule, MarketingModule],
  controllers: [OrdersController],
  providers: [OrdersService, InvoiceService],
  exports: [OrdersService, InvoiceService],
})
export class OrdersModule {}
