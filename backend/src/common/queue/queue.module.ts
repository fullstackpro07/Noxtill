import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DEMO_QUEUE, dlqName } from './queue.constants';
import { QueueService } from './queue.service';
import { DemoProcessor } from './demo.processor';
import { DeadLetterListener } from './dead-letter.listener';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT', 6379)),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: DEMO_QUEUE },
      { name: dlqName(DEMO_QUEUE) },
    ),
  ],
  providers: [QueueService, DemoProcessor, DeadLetterListener],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
