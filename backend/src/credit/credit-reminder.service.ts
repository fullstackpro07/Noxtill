import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { SendGateService } from '../messaging/send-gate.service';
import { CreditService } from './credit.service';
import { RemindDto } from './dto/remind.dto';

export interface RemindResult {
  sent: number;
  skipped: number;
}

/**
 * Credit reminders (BE-031): credit_reminder is a Utility template (so the
 * send gate doesn't block it on opt-out), but bulk "remind all" deliberately
 * excludes opted-out customers anyway — spec calls this out explicitly as
 * "opt-out safe" even though the template class alone wouldn't require it.
 */
@Injectable()
export class CreditReminderService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locale: LocaleService,
    private readonly sendGate: SendGateService,
    private readonly creditService: CreditService,
  ) {}

  async remind(businessId: string, dto: RemindDto): Promise<RemindResult> {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const targets = dto.all
      ? await this.creditService.listDebtors()
      : [
          {
            customerId: dto.customerId!,
            balance: await this.creditService.getBalance(dto.customerId!),
          },
        ];

    let sent = 0;
    let skipped = 0;

    for (const target of targets) {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { id: target.customerId },
      });
      if (!customer || customer.optedOut || target.balance <= 0) {
        skipped += 1;
        continue;
      }

      await this.sendGate
        .send({
          businessId,
          customerId: customer.id,
          templateKey: 'credit_reminder',
          variables: {
            customerName: customer.name,
            balance: this.locale.formatCurrency(target.balance, business),
          },
        })
        .catch(() => undefined);
      sent += 1;
    }

    return { sent, skipped };
  }
}
