import { Module } from '@nestjs/common';
import { GdprService } from './gdpr.service';
import { GdprController } from './gdpr.controller';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CustomersModule],
  controllers: [GdprController],
  providers: [GdprService],
})
export class GdprModule {}
