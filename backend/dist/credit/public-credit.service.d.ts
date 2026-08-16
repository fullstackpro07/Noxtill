import { PrismaService } from '../prisma/prisma.service';
export declare class PublicCreditService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getByToken(token: string): Promise<{
        businessName: string;
        customerName: string;
        balance: number;
        entries: import("./credit.types").LedgerRow[];
    }>;
}
