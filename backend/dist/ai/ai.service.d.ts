import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { ClaudeClient } from './claude.client';
import { WhatIfDto } from './dto/what-if.dto';
export declare class AiService {
    private readonly tenantPrisma;
    private readonly locale;
    private readonly claude;
    constructor(tenantPrisma: TenantPrismaService, locale: LocaleService, claude: ClaudeClient);
    whatIf(businessId: string, dto: WhatIfDto): Promise<{
        estimate: string;
        disclaimer: string;
    }>;
}
