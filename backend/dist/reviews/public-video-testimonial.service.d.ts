import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
export declare class PublicVideoTestimonialService {
    private readonly prisma;
    private readonly s3;
    constructor(prisma: PrismaService, s3: S3Service);
    getByToken(token: string): Promise<{
        businessName: string;
        branding: import("generated/prisma/runtime/library").JsonValue;
        caption: string | null;
    }>;
    upload(token: string, file: {
        buffer: Buffer;
        size: number;
        mimetype: string;
    }): Promise<{
        thankYou: boolean;
    }>;
    private loadValid;
}
