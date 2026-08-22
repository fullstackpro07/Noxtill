import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { CreateReminderRuleDto } from './dto/create-reminder-rule.dto';
import { UpdateReminderRuleDto } from './dto/update-reminder-rule.dto';
import { TestSendReminderRuleDto } from './dto/test-send-reminder-rule.dto';
import { REMINDER_RULE_ERROR_CODES } from './bookings.constants';

/**
 * Booking reminder rules (UPD-BE-092) — CRUD for the rules the reminders job
 * (`BookingRemindersProcessor`) now reads instead of the hardcoded offset constant. Enforcement
 * lives in the processor; this service is pure configuration.
 */
@Injectable()
export class ReminderRulesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  list() {
    return this.tenantPrisma.client.reminderRule.findMany({
      orderBy: { offsetHours: 'desc' },
    });
  }

  create(businessId: string, dto: CreateReminderRuleDto) {
    return this.tenantPrisma.client.reminderRule.create({
      data: {
        businessId,
        offsetHours: dto.offsetHours,
        channel: dto.channel,
        templateKey: dto.templateKey ?? 'booking_reminder',
        customMessage: dto.customMessage,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateReminderRuleDto) {
    await this.findRule(id);
    return this.tenantPrisma.client.reminderRule.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findRule(id);
    await this.tenantPrisma.client.reminderRule.delete({ where: { id } });
  }

  /** Test send (UPD-FE-074) — sends the rule's real template to an arbitrary contact, never a real customer, using the same send path the scheduled job uses. */
  async testSend(businessId: string, id: string, dto: TestSendReminderRuleDto) {
    const rule = await this.findRule(id);
    if (!dto.phone && !dto.email) {
      throw new AppException(
        REMINDER_RULE_ERROR_CODES.TEST_SEND_TARGET_REQUIRED,
        'Provide a phone number or email address to send the test to',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.sendGate.send({
      businessId,
      templateKey: rule.templateKey,
      channel: rule.channel ?? undefined,
      customBody: rule.customMessage ?? undefined,
      to: { phone: dto.phone, email: dto.email },
      variables: {
        customerName: 'Test customer',
        serviceName: 'Sample service',
        dateTime: new Date(
          Date.now() + rule.offsetHours * 60 * 60 * 1000,
        ).toISOString(),
      },
    });
  }

  private async findRule(id: string) {
    const rule = await this.tenantPrisma.client.reminderRule.findUnique({
      where: { id },
    });
    if (!rule) {
      throw new NotFoundException('Reminder rule not found');
    }
    return rule;
  }
}
