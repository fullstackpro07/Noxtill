import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
export declare class ExpensesController {
    private readonly expensesService;
    constructor(expensesService: ExpensesService);
    create(dto: CreateExpenseDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "Expense", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        description: string;
        recurring: boolean;
        incurredOn: Date;
    }>;
    findAll(query: QueryExpensesDto): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        description: string;
        recurring: boolean;
        incurredOn: Date;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        description: string;
        recurring: boolean;
        incurredOn: Date;
    }>;
    update(id: string, dto: UpdateExpenseDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        description: string;
        recurring: boolean;
        incurredOn: Date;
    }>;
    remove(id: string): Promise<void>;
}
