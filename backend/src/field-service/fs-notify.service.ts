import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { FsConfig } from './fs.constants';
import { inWindow } from './fs-time';

export type NoticeKind =
  'confirm' | 'dispatched' | 'arriving' | 'delay' | 'completed' | 'manual';

/**
 * Customer notices for field jobs. Field Service never sends messages itself — each one goes
 * through the shared send gate (consent, opt-out, channel and template rules) and lands in the
 * Unified Inbox message log. Settings › Notifications switches each kind on or off, and nothing
 * is sent inside the configured quiet hours.
 */
@Injectable()
export class FsNotifyService {
  private readonly logger = new Logger(FsNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
    private readonly cls: ClsService,
  ) {}

  async send(p: {
    cfg: FsConfig;
    tz: string;
    kind: NoticeKind;
    customerId: string;
    templateKey: 'field_appointment' | 'field_update';
    variables: Record<string, string>;
  }): Promise<{ sent: boolean; why: string }> {
    if (p.kind !== 'manual' && !p.cfg.notify[p.kind])
      return {
        sent: false,
        why: `“${p.kind}” notices are off in Field Service › Settings › Notifications`,
      };
    if (inWindow(p.cfg.notify.quiet, new Date(), p.tz))
      return {
        sent: false,
        why: `quiet hours (${p.cfg.notify.quiet}) — not sent`,
      };
    const customer = await this.prisma.customer.findUnique({
      where: { id: p.customerId },
      select: { businessId: true, name: true },
    });
    if (!customer) return { sent: false, why: 'customer not found' };
    try {
      const m = await this.cls.run(async () => {
        this.cls.set(CLS_KEY_BUSINESS_ID, customer.businessId);
        return this.sendGate.send({
          businessId: customer.businessId,
          customerId: p.customerId,
          templateKey: p.templateKey,
          variables: { customerName: customer.name, ...p.variables },
        });
      });
      return { sent: true, why: `sent via ${m.channel}` };
    } catch (e) {
      this.logger.warn(`field notice not sent: ${(e as Error).message}`);
      return { sent: false, why: (e as Error).message.slice(0, 200) };
    }
  }
}
