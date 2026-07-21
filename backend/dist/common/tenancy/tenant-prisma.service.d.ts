import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
declare function extendClient(prisma: PrismaService, cls: ClsService): import("generated/prisma/runtime/library").DynamicClientExtensionThis<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
    result: {};
    model: {};
    query: {};
    client: {};
}, {}>, import("generated/prisma").Prisma.TypeMapCb<import("generated/prisma").Prisma.PrismaClientOptions>, {
    result: {};
    model: {};
    query: {};
    client: {};
}>;
export declare class TenantPrismaService {
    readonly client: ReturnType<typeof extendClient>;
    constructor(prisma: PrismaService, cls: ClsService);
}
export {};
