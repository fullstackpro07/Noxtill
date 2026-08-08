import { OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
export declare class KeywordRankScheduler implements OnModuleInit {
    private readonly queue;
    private readonly logger;
    constructor(queue: Queue);
    onModuleInit(): void;
}
