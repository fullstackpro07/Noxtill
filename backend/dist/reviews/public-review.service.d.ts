import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ActivityService } from '../activity/activity.service';
import { SubmitReviewDto } from './dto/submit-review.dto';
export declare class PublicReviewService {
    private readonly prisma;
    private readonly sendGate;
    private readonly activity;
    constructor(prisma: PrismaService, sendGate: SendGateService, activity: ActivityService);
    mintAnonymousLink(slug: string): Promise<{
        token: string;
    }>;
    getWidget(slug: string): Promise<{
        businessName: string;
        branding: import("generated/prisma/runtime/library").JsonValue;
        reviews: {
            createdAt: Date;
            stars: number;
            platform: string;
            author: string | null;
            text: string | null;
        }[];
    }>;
    getByToken(token: string): Promise<{
        businessName: string;
        branding: import("generated/prisma/runtime/library").JsonValue;
    }>;
    submit(token: string, dto: SubmitReviewDto): Promise<{
        thankYou: boolean;
        redirect?: undefined;
    } | {
        redirect: string;
        thankYou?: undefined;
    }>;
    private loadValid;
    private alertOwner;
}
