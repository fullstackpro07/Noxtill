import { Module } from '@nestjs/common';
import { PublicOrderingService } from './public-ordering.service';
import { PublicOrderingController } from './public-ordering.controller';

@Module({
  controllers: [PublicOrderingController],
  providers: [PublicOrderingService],
})
export class PublicOrderingModule {}
