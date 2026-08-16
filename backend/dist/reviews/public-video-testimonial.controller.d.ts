import { PublicVideoTestimonialService } from './public-video-testimonial.service';
export declare class PublicVideoTestimonialController {
    private readonly publicVideoTestimonialService;
    constructor(publicVideoTestimonialService: PublicVideoTestimonialService);
    getByToken(token: string): Promise<{
        businessName: string;
        branding: import("generated/prisma/runtime/library").JsonValue;
        caption: string | null;
    }>;
    upload(token: string, file?: Express.Multer.File): Promise<{
        thankYou: boolean;
    }>;
}
