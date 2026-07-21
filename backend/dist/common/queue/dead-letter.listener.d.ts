import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DeadLetterJobData, DemoJobData } from './queue.constants';
export declare class DeadLetterListener implements OnModuleInit, OnModuleDestroy {
    private readonly demoQueue;
    private readonly demoDlq;
    private readonly config;
    private readonly logger;
    private events?;
    constructor(demoQueue: Queue<DemoJobData>, demoDlq: Queue<DeadLetterJobData>, config: ConfigService);
    onModuleInit(): void;
    private moveToDlqIfExhausted;
    onModuleDestroy(): Promise<void>;
}
