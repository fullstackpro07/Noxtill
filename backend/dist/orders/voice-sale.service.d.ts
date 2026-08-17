import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SpeechToTextService } from '../ai/speech-to-text.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { OrdersService } from './orders.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { Prisma } from '../../generated/prisma';
export interface ParsedVoiceItem {
    productName: string;
    qty: number;
}
export interface ParsedVoiceCart {
    items: ParsedVoiceItem[];
    customerName: string | null;
    paymentMethodGuess: 'cash' | 'card' | 'online' | 'credit' | null;
}
export interface MatchedVoiceItem {
    productId: string | null;
    name: string;
    qty: number;
    matched: boolean;
}
export declare class VoiceSaleService {
    private readonly tenantPrisma;
    private readonly speechToText;
    private readonly aiInfra;
    private readonly ordersService;
    private readonly logger;
    constructor(tenantPrisma: TenantPrismaService, speechToText: SpeechToTextService, aiInfra: AiInfraService, ordersService: OrdersService);
    parse(businessId: string, file: {
        buffer: Buffer;
        size: number;
        mimetype: string;
        originalname: string;
    }): Promise<{
        items: MatchedVoiceItem[];
        customerName: string | null;
        paymentMethodGuess: "online" | "credit" | "cash" | "card" | null;
        id: string;
        transcript: string;
    }>;
    confirm(businessId: string, id: string, dto: CreateSaleDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.OrderStatus;
        orderNo: number;
        orderType: import("../../generated/prisma").$Enums.OrderType;
        tableNo: string | null;
        subtotal: Prisma.Decimal;
        tax: Prisma.Decimal;
        discount: Prisma.Decimal;
        total: Prisma.Decimal;
        cogs: Prisma.Decimal;
        isQuotation: boolean;
        staffUserId: string | null;
        couponId: string | null;
        couponDiscountAmount: Prisma.Decimal | null;
        voucherId: string | null;
        voucherAmountApplied: Prisma.Decimal | null;
    }>;
    private parseTranscript;
    private matchProducts;
}
