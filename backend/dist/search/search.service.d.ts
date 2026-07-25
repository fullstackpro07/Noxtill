import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export declare class SearchService {
    private readonly tenantPrisma;
    private readonly cls;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService);
    search(query: string): Promise<{
        customers: {
            id: string;
            name: string;
            phone: string;
        }[];
        products: {
            id: string;
            name: string;
        }[];
        orders: {
            id: string;
            orderNo: number;
        }[];
        appointments: {
            id: string;
            serviceName: string;
            customerName: string;
            startsAt: Date;
        }[];
        credit: {
            customerId: string;
            name: string;
            balance: number;
        }[];
    }>;
}
