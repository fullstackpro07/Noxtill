import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { LocaleService } from '../../common/localization/locale.service';
import { CREDIT_REMINDERS_QUEUE } from './credit-reminders.constants';
import { CREDIT_REMINDER_TONE_TEMPLATE_KEYS } from '../credit.constants';

interface CreditRemindersJobData {
  /** ISO timestamp override, used only by tests to make "now" deterministic. */
  now?: string;
}

interface DebtorRow {
  customer_id: string;
  name: string;
  phone: string;
  balance: string;
  days_outstanding: number;
  opted_out: number;
}

function todayStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Credit reminder rules (UPD-BE-095): runs once a day (see scheduler). For each debtor, picks the
 * single highest-matching active rule (the largest `daysOverdueTrigger` they've crossed) — never
 * every matching rule at once, so a 90-day-overdue debtor with 30/60/90-day rules gets one message,
 * not three. Reminds each (customer, rule) pair at most once per calendar day, tracked via
 * `CreditReminderLog` — so a debtor who stays overdue for weeks keeps getting reminded (a real,
 * disclosed behaviour for an escalating dunning flow), but never more than once a day.
 */
@Processor(CREDIT_REMINDERS_QUEUE)
export class CreditRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(CreditRemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
    private readonly locale: LocaleService,
  ) {
    super();
  }

  async process(job: Job<CreditRemindersJobData>): Promise<void> {
    if (job.name !== 'tick') return;
    const now = job.data?.now ? new Date(job.data.now) : new Date();
    return this.runReminders(now);
  }

  async runReminders(now: Date = new Date()): Promise<void> {
    let sent = 0;
    const dayStart = todayStart(now);

    const businesses = await this.prisma.business.findMany({
      select: {
        id: true,
        name: true,
        currency: true,
        locale: true,
        timezone: true,
      },
    });

    for (const business of businesses) {
      const rules = await this.prisma.creditReminderRule.findMany({
        where: { businessId: business.id, active: true },
      });
      if (rules.length === 0) continue;

      const debtors = await this.prisma.$queryRaw<DebtorRow[]>`
        SELECT v.customer_id, c.name, c.phone, v.balance, v.days_outstanding, c.opted_out
        FROM v_credit_balances v
        JOIN customers c ON c.id = v.customer_id
        WHERE v.business_id = ${business.id} AND v.balance > 0
      `;

      for (const debtor of debtors) {
        if (debtor.opted_out) continue;

        const matching = rules
          .filter((r) => debtor.days_outstanding >= r.daysOverdueTrigger)
          .sort((a, b) => b.daysOverdueTrigger - a.daysOverdueTrigger)[0];
        if (!matching) continue;

        const alreadySentToday = await this.prisma.creditReminderLog.findFirst({
          where: {
            businessId: business.id,
            customerId: debtor.customer_id,
            ruleId: matching.id,
            sentAt: { gte: dayStart },
          },
        });
        if (alreadySentToday) continue;

        await this.sendGate
          .send({
            businessId: business.id,
            customerId: debtor.customer_id,
            templateKey: CREDIT_REMINDER_TONE_TEMPLATE_KEYS[matching.tone],
            channel: matching.channel ?? undefined,
            customBody: matching.customMessage ?? undefined,
            variables: {
              customerName: debtor.name,
              balance: this.locale.formatCurrency(
                Number(debtor.balance),
                business,
              ),
            },
          })
          .catch(() => undefined);

        await this.prisma.creditReminderLog.create({
          data: {
            businessId: business.id,
            customerId: debtor.customer_id,
            ruleId: matching.id,
          },
        });
        sent += 1;
      }
    }

    this.logger.debug(`Credit reminders sent for ${sent} debtor(s)`);
  }
}
