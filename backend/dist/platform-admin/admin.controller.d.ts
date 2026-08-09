import { AdminService } from './admin.service';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
    activationFunnel(sinceDays?: string): Promise<{
        name: "signup_started" | "signup_completed" | "first_sale_recorded" | "first_review_request_sent";
        count: number;
    }[]>;
    events(name?: string, limit?: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        businessId: string | null;
        userId: string | null;
        properties: import("generated/prisma/runtime/library").JsonValue;
    }[]>;
    businessesSummary(): Promise<{
        total: number;
        byPlan: (import("generated/prisma").Prisma.PickEnumerable<import("generated/prisma").Prisma.BusinessGroupByOutputType, "planId"[]> & {
            _count: {
                _all: number;
            };
        })[];
    }>;
}
