import { WorkerHost } from '@nestjs/bullmq';
import { ExpensesService } from './expenses.service';
export declare class RecurringExpensesProcessor extends WorkerHost {
    private readonly expensesService;
    private readonly logger;
    constructor(expensesService: ExpensesService);
    process(): Promise<void>;
}
