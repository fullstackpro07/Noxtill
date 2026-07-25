import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { LocaleService } from '../common/localization/locale.service';
import { BranchAdvisorDto } from './dto/branch-advisor.dto';
export declare class BranchAdvisorService {
    private readonly tenantPrisma;
    private readonly locale;
    private readonly aiInfra;
    constructor(tenantPrisma: TenantPrismaService, locale: LocaleService, aiInfra: AiInfraService);
    ask(businessId: string, dto: BranchAdvisorDto): Promise<{
        answer: string;
        disclaimer: string;
    }>;
}
