import { Module } from '@nestjs/common';
import { PublicOrderingService } from './public-ordering.service';
import { PublicOrderingController } from './public-ordering.controller';
import { ActivityModule } from '../activity/activity.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [ActivityModule, PaymentsModule],
  controllers: [PublicOrderingController],
  providers: [PublicOrderingService],
})
export class PublicOrderingModule {}
