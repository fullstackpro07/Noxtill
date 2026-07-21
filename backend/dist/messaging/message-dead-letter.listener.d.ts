import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
interface SendJobData {
    messageId: string;
}
export declare class MessageDeadLetterListener implements OnModuleInit, OnModuleDestroy {
    private readonly messagesQueue;
    private readonly messagesDlq;
    private readonly prisma;
    private readonly config;
    private readonly logger;
    private events?;
    constructor(messagesQueue: Queue<SendJobData>, messagesDlq: Queue<{
        originalJobId: string;
        data: SendJobData;
        failedReason: string;
    }>, prisma: PrismaService, config: ConfigService);
    onModuleInit(): void;
    private moveToDlqIfExhausted;
    onModuleDestroy(): Promise<void>;
}
export {};
