import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
export declare class TwoFactorService {
    private readonly prisma;
    private readonly sendGate;
    constructor(prisma: PrismaService, sendGate: SendGateService);
    generateAndSend(userId: string, businessId: string, phone: string): Promise<void>;
    verify(userId: string, code: string): Promise<void>;
}
