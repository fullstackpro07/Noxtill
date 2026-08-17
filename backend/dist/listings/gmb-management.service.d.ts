import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { GmbConnector } from '../integrations/connectors/gmb.connector';
import { CreateGmbPhotoDto, CreateGmbPostDto } from './dto/gmb.dto';
export declare class GmbManagementService {
    private readonly tenantPrisma;
    private readonly integrations;
    private readonly gmbConnector;
    constructor(tenantPrisma: TenantPrismaService, integrations: IntegrationsService, gmbConnector: GmbConnector);
    listAccounts(businessId: string): Promise<unknown>;
    listLocations(businessId: string, accountName: string): Promise<unknown>;
    selectLocation(businessId: string, locationId: string): Promise<{
        locationId: string;
    }>;
    listPosts(businessId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.GmbPostStatus;
        scheduledFor: Date | null;
        externalId: string | null;
        text: string;
        photoUrl: string | null;
        buttonType: string | null;
    }[]>;
    createPost(businessId: string, dto: CreateGmbPostDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("../../generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "GmbPost", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.GmbPostStatus;
        scheduledFor: Date | null;
        externalId: string | null;
        text: string;
        photoUrl: string | null;
        buttonType: string | null;
    }>;
    deletePost(businessId: string, postId: string): Promise<void>;
    publishPost(businessId: string, postId: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.GmbPostStatus;
        scheduledFor: Date | null;
        externalId: string | null;
        text: string;
        photoUrl: string | null;
        buttonType: string | null;
    }>;
    listPhotos(businessId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        category: string | null;
        externalId: string | null;
        url: string;
    }[]>;
    addPhoto(businessId: string, dto: CreateGmbPhotoDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("../../generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "GmbPhoto", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        category: string | null;
        externalId: string | null;
        url: string;
    }>;
    removePhoto(businessId: string, photoId: string): Promise<void>;
    listQna(businessId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        externalId: string | null;
        question: string;
        answer: string | null;
        answeredAt: Date | null;
    }[]>;
    syncQuestions(businessId: string): Promise<number>;
    answerQuestion(businessId: string, qnaId: string, answer: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        externalId: string | null;
        question: string;
        answer: string | null;
        answeredAt: Date | null;
    }>;
    listInsights(businessId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        date: Date;
        views: number;
        searches: number;
        calls: number;
        directionRequests: number;
    }[]>;
    pullInsights(businessId: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        date: Date;
        views: number;
        searches: number;
        calls: number;
        directionRequests: number;
    }>;
    private extractMetrics;
    private findPost;
    private requireGmbConnection;
}
