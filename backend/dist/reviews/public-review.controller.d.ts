import type { Response } from 'express';
import { PublicReviewService } from './public-review.service';
import { SubmitReviewDto } from './dto/submit-review.dto';
export declare class PublicReviewController {
    private readonly publicReviewService;
    constructor(publicReviewService: PublicReviewService);
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
    mintQrLink(slug: string): Promise<{
        token: string;
    }>;
    widget(biz: string, res: Response): Promise<{
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
}
