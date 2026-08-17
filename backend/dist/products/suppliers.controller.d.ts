import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuickPurchaseOrderDto } from './dto/quick-purchase-order.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class SuppliersController {
    private readonly suppliersService;
    constructor(suppliersService: SuppliersService);
    create(dto: CreateSupplierDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
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
    quickPurchaseOrder(user: AuthenticatedUser, id: string, dto: QuickPurchaseOrderDto): Promise<{
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
