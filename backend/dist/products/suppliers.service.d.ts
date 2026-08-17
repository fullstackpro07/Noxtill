import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuickPurchaseOrderDto } from './dto/quick-purchase-order.dto';
import { Prisma } from '../../generated/prisma';
export declare class SuppliersService {
    private readonly tenantPrisma;
    private readonly activity;
    constructor(tenantPrisma: TenantPrismaService, activity: ActivityService);
    create(dto: CreateSupplierDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "Supplier", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        email: string | null;
        phone: string | null;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        address: string | null;
        notes: string | null;
    }>;
    findAll(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        email: string | null;
        phone: string | null;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        address: string | null;
        notes: string | null;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        email: string | null;
        phone: string | null;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        address: string | null;
        notes: string | null;
    }>;
    update(id: string, dto: UpdateSupplierDto): Promise<{
        id: string;
        email: string | null;
        phone: string | null;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        address: string | null;
        notes: string | null;
    }>;
    remove(id: string): Promise<void>;
    quickPurchaseOrder(businessId: string, supplierId: string, dto: QuickPurchaseOrderDto): Promise<{
        supplierId: string;
        lines: {
            productId: string;
            productName: string;
            qty: number;
            unitCost: number;
            stockMovementId: string;
        }[];
    }>;
}
