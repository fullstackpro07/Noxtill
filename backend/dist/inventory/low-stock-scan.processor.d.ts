import { WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
export declare class LowStockScanProcessor extends WorkerHost {
    private readonly prisma;
    private readonly sendGate;
    private readonly logger;
    constructor(prisma: PrismaService, sendGate: SendGateService);
    process(): Promise<void>;
    private scanBusiness;
    private alreadyAlertedToday;
}
