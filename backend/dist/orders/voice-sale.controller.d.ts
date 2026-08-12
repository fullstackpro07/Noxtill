import { VoiceSaleService } from './voice-sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class VoiceSaleController {
    private readonly voiceSaleService;
    constructor(voiceSaleService: VoiceSaleService);
    parse(user: AuthenticatedUser, file?: Express.Multer.File): Promise<{
        items: import("./voice-sale.service").MatchedVoiceItem[];
        customerName: string | null;
        paymentMethodGuess: "online" | "credit" | "cash" | "card" | null;
        id: string;
        transcript: string;
    }>;
    confirm(user: AuthenticatedUser, id: string, dto: CreateSaleDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        orderNo: number;
        customerId: string | null;
        orderType: import("generated/prisma").$Enums.OrderType;
        tableNo: string | null;
        status: import("generated/prisma").$Enums.OrderStatus;
        subtotal: import("generated/prisma/runtime/library").Decimal;
        tax: import("generated/prisma/runtime/library").Decimal;
        discount: import("generated/prisma/runtime/library").Decimal;
        total: import("generated/prisma/runtime/library").Decimal;
        cogs: import("generated/prisma/runtime/library").Decimal;
        isQuotation: boolean;
        staffUserId: string | null;
    }>;
}
