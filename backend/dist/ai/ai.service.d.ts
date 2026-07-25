import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { AiInfraService } from './ai-infra.service';
import { WhatIfDto } from './dto/what-if.dto';
export declare class AiService {
    private readonly tenantPrisma;
    private readonly locale;
    private readonly aiInfra;
    constructor(tenantPrisma: TenantPrismaService, locale: LocaleService, aiInfra: AiInfraService);
    whatIf(businessId: string, dto: WhatIfDto): Promise<{
        estimate: string;
        disclaimer: string;
    }>;
}
