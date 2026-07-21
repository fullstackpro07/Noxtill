import { OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
export declare class NightlyCloseScheduler implements OnModuleInit {
    private readonly queue;
    private readonly logger;
    constructor(queue: Queue);
    onModuleInit(): void;
}
