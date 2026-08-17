import { PublicCreditService } from './public-credit.service';
export declare class PublicCreditController {
    private readonly publicCreditService;
    constructor(publicCreditService: PublicCreditService);
    getByToken(token: string): Promise<{
        businessName: string;
        customerName: string;
        balance: number;
        entries: import("./credit.types").LedgerRow[];
    }>;
}
