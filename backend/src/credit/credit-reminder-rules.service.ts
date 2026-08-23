import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { CreateCreditReminderRuleDto } from './dto/create-credit-reminder-rule.dto';
import { UpdateCreditReminderRuleDto } from './dto/update-credit-reminder-rule.dto';
import { TestSendCreditReminderRuleDto } from './dto/test-send-credit-reminder-rule.dto';
import {
  CREDIT_ERROR_CODES,
  CREDIT_REMINDER_TONE_TEMPLATE_KEYS,
} from './credit.constants';
import { Prisma } from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Credit reminder rules (UPD-BE-095) — CRUD for the staged rules `CreditReminderProcessor` reads.
 * Pure configuration; enforcement/sending lives in the processor (scheduled) and here (test send).
 */
@Injectable()
export class CreditReminderRulesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  list() {
    return this.tenantPrisma.client.creditReminderRule.findMany({
      orderBy: { daysOverdueTrigger: 'asc' },
    });
  }

  create(businessId: string, dto: CreateCreditReminderRuleDto) {
    return this.tenantPrisma.client.creditReminderRule.create({
      data: {
        businessId,
        daysOverdueTrigger: dto.daysOverdueTrigger,
        tone: dto.tone ?? 'gentle',
        channel: dto.channel,
        customMessage: dto.customMessage,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCreditReminderRuleDto) {
    await this.findRule(id);
    return this.tenantPrisma.client.creditReminderRule.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findRule(id);
    await this.tenantPrisma.client.creditReminderRule.delete({ where: { id } });
  }

  /** Test send — sends the rule's real wording to an arbitrary contact, never a real debtor. */
  async testSend(
    businessId: string,
    id: string,
    dto: TestSendCreditReminderRuleDto,
  ) {
    const rule = await this.findRule(id);
    if (!dto.phone && !dto.email) {
      throw new AppException(
        CREDIT_ERROR_CODES.TEST_SEND_TARGET_REQUIRED,
        'Provide a phone number or email address to send the test to',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.sendGate.send({
      businessId,
      templateKey: CREDIT_REMINDER_TONE_TEMPLATE_KEYS[rule.tone],
      channel: rule.channel ?? undefined,
      customBody: rule.customMessage ?? undefined,
      to: { phone: dto.phone, email: dto.email },
      variables: {
        customerName: 'Test customer',
        balance: '100.00',
      },
    });
  }

  /**
   * Reminders & Recovery screen's "recovery-rate-by-stage chart" (UPD-FE-079) — a real, honest
   * correlation (not a fabricated causal claim): for each rule, of the distinct customers ever
   * reminded at that stage, how many currently have a zero balance (i.e. have since paid off).
   */
  async recoveryRateByStage() {
    const rules = await this.tenantPrisma.client.creditReminderRule.findMany({
      orderBy: { daysOverdueTrigger: 'asc' },
    });

    return Promise.all(
      rules.map(async (rule) => {
        const logs = await this.tenantPrisma.client.creditReminderLog.findMany({
          where: { ruleId: rule.id },
          select: { customerId: true },
          distinct: ['customerId'],
        });
        const remindedCustomerIds = logs.map((l) => l.customerId);
        if (remindedCustomerIds.length === 0) {
          return {
            ruleId: rule.id,
            daysOverdueTrigger: rule.daysOverdueTrigger,
            tone: rule.tone,
            remindedCount: 0,
            recoveredCount: 0,
            recoveryRate: 0,
          };
        }

        const stillOwing = await this.tenantPrisma.client.$queryRaw<
          { customer_id: string }[]
        >`
          SELECT DISTINCT customer_id FROM v_credit_balances
          WHERE customer_id IN (${Prisma.join(remindedCustomerIds)}) AND balance > 0
        `;
        const stillOwingIds = new Set(stillOwing.map((r) => r.customer_id));
        const recoveredCount = remindedCustomerIds.filter(
          (id) => !stillOwingIds.has(id),
        ).length;

        return {
          ruleId: rule.id,
          daysOverdueTrigger: rule.daysOverdueTrigger,
          tone: rule.tone,
          remindedCount: remindedCustomerIds.length,
          recoveredCount,
          recoveryRate: round2(
            (recoveredCount / remindedCustomerIds.length) * 100,
          ),
        };
      }),
    );
  }

  private async findRule(id: string) {
    const rule = await this.tenantPrisma.client.creditReminderRule.findUnique({
      where: { id },
    });
    if (!rule) {
      throw new NotFoundException('Credit reminder rule not found');
    }
    return rule;
  }
}
