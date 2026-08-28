import { Module } from '@nestjs/common';
import { BookDemoController } from './book-demo.controller';
import { BookDemoService } from './book-demo.service';

@Module({
  controllers: [BookDemoController],
  providers: [BookDemoService],
})
export class BookDemoModule {}
