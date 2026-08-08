import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { Prisma } from '../../generated/prisma';
export declare class ExpensesService {
    private readonly tenantPrisma;
    private readonly prisma;
    constructor(tenantPrisma: TenantPrismaService, prisma: PrismaService);
    create(dto: CreateExpenseDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "Expense", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        category: string;
        amount: Prisma.Decimal;
        description: string;
        recurring: boolean;
        incurredOn: Date;
    }>;
    findAll(query: QueryExpensesDto): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        category: string;
        amount: Prisma.Decimal;
        description: string;
        recurring: boolean;
        incurredOn: Date;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        category: string;
        amount: Prisma.Decimal;
        description: string;
        recurring: boolean;
        incurredOn: Date;
    }>;
    update(id: string, dto: UpdateExpenseDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        category: string;
        amount: Prisma.Decimal;
        description: string;
        recurring: boolean;
        incurredOn: Date;
    }>;
    remove(id: string): Promise<void>;
    cloneRecurringExpenses(referenceDate?: Date): Promise<number>;
}
