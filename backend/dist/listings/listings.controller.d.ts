import { MasterListingService } from './master-listing.service';
import { ListingSyncService } from './listing-sync.service';
import { GmbManagementService } from './gmb-management.service';
import { UpdateMasterListingDto } from './dto/update-master-listing.dto';
import { AnswerGmbQnaDto, SelectGmbLocationDto, CreateGmbPhotoDto, CreateGmbPostDto } from './dto/gmb.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class ListingsController {
    private readonly masterListing;
    private readonly listingSync;
    private readonly gmbManagement;
    constructor(masterListing: MasterListingService, listingSync: ListingSyncService, gmbManagement: GmbManagementService);
    getMaster(user: AuthenticatedUser): Promise<{
        name: string;
        phone: string | null;
        country: string | null;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        website: string | null;
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        categories: import("generated/prisma/runtime/library").JsonValue;
        hours: import("generated/prisma/runtime/library").JsonValue;
        logoUrl: string | null;
    } | {
        id: null;
        businessId: string;
        name: string;
        phone: null;
        website: null;
        addressLine1: null;
        addressLine2: null;
        city: null;
        state: null;
        postalCode: null;
        country: null;
        categories: string[];
        description: null;
        hours: Record<string, unknown>;
        logoUrl: null;
        createdAt: null;
        updatedAt: null;
    }>;
    updateMaster(user: AuthenticatedUser, dto: UpdateMasterListingDto): Promise<{
        name: string;
        phone: string | null;
        country: string | null;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        website: string | null;
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        categories: import("generated/prisma/runtime/library").JsonValue;
        hours: import("generated/prisma/runtime/library").JsonValue;
        logoUrl: string | null;
    }>;
    sync(user: AuthenticatedUser): Promise<import("./listing-sync.service").SyncResult[]>;
    syncLog(user: AuthenticatedUser): import("generated/prisma/runtime/library").PrismaPromise<{
        message: string | null;
        id: string;
        businessId: string;
        createdAt: Date;
        status: string;
        provider: import("generated/prisma").$Enums.IntegrationProvider;
    }[]>;
    health(user: AuthenticatedUser): Promise<{
        score: number;
        totalProviders: number;
        connectedProviders: import("generated/prisma").$Enums.IntegrationProvider[];
        hasRecentSync: boolean;
        mismatchCount: number;
    }>;
    citations(user: AuthenticatedUser): Promise<{
        provider: import("generated/prisma").$Enums.IntegrationProvider;
        syncedAt: Date;
        matches: boolean;
        mismatchedFields: string[];
    }[]>;
    listGmbAccounts(user: AuthenticatedUser): Promise<unknown>;
    listGmbLocations(user: AuthenticatedUser, accountName: string): Promise<unknown>;
    selectGmbLocation(user: AuthenticatedUser, dto: SelectGmbLocationDto): Promise<{
        locationId: string;
    }>;
    listPosts(user: AuthenticatedUser): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.GmbPostStatus;
        scheduledFor: Date | null;
        externalId: string | null;
        text: string;
        photoUrl: string | null;
        buttonType: string | null;
    }[]>;
    createPost(user: AuthenticatedUser, dto: CreateGmbPostDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "GmbPost", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.GmbPostStatus;
        scheduledFor: Date | null;
        externalId: string | null;
        text: string;
        photoUrl: string | null;
        buttonType: string | null;
    }>;
    publishPost(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.GmbPostStatus;
        scheduledFor: Date | null;
        externalId: string | null;
        text: string;
        photoUrl: string | null;
        buttonType: string | null;
    }>;
    deletePost(user: AuthenticatedUser, id: string): Promise<void>;
    listPhotos(user: AuthenticatedUser): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        category: string | null;
        externalId: string | null;
        url: string;
    }[]>;
    addPhoto(user: AuthenticatedUser, dto: CreateGmbPhotoDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
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
    removePhoto(user: AuthenticatedUser, id: string): Promise<void>;
    listQna(user: AuthenticatedUser): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        externalId: string | null;
        question: string;
        answer: string | null;
        answeredAt: Date | null;
    }[]>;
    syncQna(user: AuthenticatedUser): Promise<number>;
    answerQna(user: AuthenticatedUser, id: string, dto: AnswerGmbQnaDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        externalId: string | null;
        question: string;
        answer: string | null;
        answeredAt: Date | null;
    }>;
    listInsights(user: AuthenticatedUser): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        date: Date;
        views: number;
        searches: number;
        calls: number;
        directionRequests: number;
    }[]>;
    pullInsights(user: AuthenticatedUser): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        date: Date;
        views: number;
        searches: number;
        calls: number;
        directionRequests: number;
    }>;
}
