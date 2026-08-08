import { SendGateService } from './send-gate.service';
import { MessagesService } from './messages.service';
import { TestMessageDto } from './dto/test-message.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class MessagesController {
    private readonly sendGate;
    private readonly messagesService;
    constructor(sendGate: SendGateService, messagesService: MessagesService);
    test(user: AuthenticatedUser, dto: TestMessageDto): Promise<{
        id: string;
        businessId: string;
        customerId: string | null;
        channel: import("../../generated/prisma").$Enums.MessageChannel;
        category: import("../../generated/prisma").$Enums.MessageCategory;
        templateKey: string;
        locale: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        status: import("../../generated/prisma").$Enums.MessageStatus;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    list(customerId: string): Promise<{
        id: string;
        businessId: string;
        customerId: string | null;
        channel: import("../../generated/prisma").$Enums.MessageChannel;
        category: import("../../generated/prisma").$Enums.MessageCategory;
        templateKey: string;
        locale: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        status: import("../../generated/prisma").$Enums.MessageStatus;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
}
