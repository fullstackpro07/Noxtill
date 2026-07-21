import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { SendGateService } from '../messaging/send-gate.service';
import { CreditService } from './credit.service';
import { RemindDto } from './dto/remind.dto';
export interface RemindResult {
    sent: number;
    skipped: number;
}
export declare class CreditReminderService {
    private readonly tenantPrisma;
    private readonly locale;
    private readonly sendGate;
    private readonly creditService;
    constructor(tenantPrisma: TenantPrismaService, locale: LocaleService, sendGate: SendGateService, creditService: CreditService);
    remind(businessId: string, dto: RemindDto): Promise<RemindResult>;
}
