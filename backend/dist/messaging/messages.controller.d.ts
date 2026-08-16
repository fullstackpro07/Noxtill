import { SendGateService } from './send-gate.service';
import { MessagesService } from './messages.service';
import { TestMessageDto } from './dto/test-message.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class MessagesController {
    private readonly sendGate;
    private readonly messagesService;
    constructor(sendGate: SendGateService, messagesService: MessagesService);
    test(user: AuthenticatedUser, dto: TestMessageDto): Promise<{
        locale: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("generated/prisma").$Enums.MessageCategory;
        customerId: string | null;
        status: import("generated/prisma").$Enums.MessageStatus;
        channel: import("generated/prisma").$Enums.MessageChannel;
        templateKey: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
    }>;
    list(customerId: string): Promise<{
        locale: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("generated/prisma").$Enums.MessageCategory;
        customerId: string | null;
        status: import("generated/prisma").$Enums.MessageStatus;
        channel: import("generated/prisma").$Enums.MessageChannel;
        templateKey: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
    }[]>;
}
