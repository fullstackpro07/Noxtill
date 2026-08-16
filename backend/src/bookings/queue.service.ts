import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { QUEUE_ERROR_CODES } from './bookings.constants';
import { QueueTokenStatus } from '../../generated/prisma';

function todayStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Queue / Tokens (UPD-BE-018) — walk-in numbering, sequential per business per calendar day (UTC). */
@Injectable()
export class QueueService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  async join(businessId: string, dto: JoinQueueDto) {
    const [{ next }] = await this.tenantPrisma.client.$queryRaw<
      { next: number }[]
    >`
      SELECT COALESCE(MAX(number), 0) + 1 AS next FROM queue_tokens
      WHERE business_id = ${businessId} AND created_at >= ${todayStart()}
    `;

    return this.tenantPrisma.client.queueToken.create({
      data: {
        businessId,
        number: next,
        customerId: dto.customerId,
        customerName: dto.customerName,
        serviceId: dto.serviceId,
      },
    });
  }

  list() {
    return this.tenantPrisma.client.queueToken.findMany({
      where: { createdAt: { gte: todayStart() } },
      orderBy: { number: 'asc' },
      include: { customer: true, service: true },
    });
  }

  async call(businessId: string, id: string) {
    await this.findWithStatus(id, [QueueTokenStatus.waiting]);
    const updated = await this.tenantPrisma.client.queueToken.update({
      where: { id },
      data: { status: QueueTokenStatus.called, calledAt: new Date() },
    });

    if (updated.customerId) {
      await this.sendGate
        .send({
          businessId,
          customerId: updated.customerId,
          templateKey: 'queue_called',
          variables: { number: String(updated.number) },
        })
        .catch(() => undefined);
    }

    return updated;
  }

  async serve(id: string) {
    await this.findWithStatus(id, [
      QueueTokenStatus.waiting,
      QueueTokenStatus.called,
    ]);
    return this.tenantPrisma.client.queueToken.update({
      where: { id },
      data: { status: QueueTokenStatus.served, servedAt: new Date() },
    });
  }

  async skip(id: string) {
    await this.findWithStatus(id, [
      QueueTokenStatus.waiting,
      QueueTokenStatus.called,
    ]);
    return this.tenantPrisma.client.queueToken.update({
      where: { id },
      data: { status: QueueTokenStatus.skipped },
    });
  }

  private async findWithStatus(id: string, allowed: QueueTokenStatus[]) {
    const token = await this.tenantPrisma.client.queueToken.findUnique({
      where: { id },
    });
    if (!token) {
      throw new NotFoundException('Queue token not found');
    }
    if (!allowed.includes(token.status)) {
      throw new AppException(
        QUEUE_ERROR_CODES.INVALID_TRANSITION,
        `Token is "${token.status}", expected one of: ${allowed.join(', ')}`,
        HttpStatus.CONFLICT,
      );
    }
    return token;
  }
}
