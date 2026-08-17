import { PayrollService } from './payroll.service';
import { QueryPayrollDto } from './dto/query-payroll.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class PayrollController {
    private readonly payroll;
    constructor(payroll: PayrollService);
    export(user: AuthenticatedUser, query: QueryPayrollDto): Promise<{
        url: string;
        warnings: string[];
    }>;
}
