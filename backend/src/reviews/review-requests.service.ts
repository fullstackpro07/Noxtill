import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { CreateReviewRequestDto } from './dto/create-review-request.dto';
import { generateReviewToken } from './review-token.util';

const REVIEW_REQUEST_DELAY_MS = 2 * 60 * 60 * 1000; // +2h, per spec §4.1

/**
 * Review request creation + send scheduling (BE-045). `scheduleSend` is the
 * piece OrdersService (BE-025) also needs — a sale completing is itself a
 * review-request trigger, so that call site creates the ReviewRequest row
 * inside its own atomic transaction and then calls back into this service
 * for the (non-transactional) send scheduling, avoiding duplicating that bit.
 */
@Injectable()
export class ReviewRequestsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  async create(businessId: string, dto: CreateReviewRequestDto) {
    let customerId = dto.customerId;

    if (!customerId && dto.phone) {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { businessId_phone: { businessId, phone: dto.phone } },
      });
      if (!customer) {
        throw new NotFoundException('No customer found with that phone number');
      }
      customerId = customer.id;
    }

    if (!customerId) {
      throw new NotFoundException('customerId or phone is required');
    }

    const token = generateReviewToken();
    const reviewRequest = await this.tenantPrisma.client.reviewRequest.create({
      data: {
        businessId,
        customerId,
        token,
        source: dto.source,
        sourceId: dto.sourceId,
      },
    });

    await this.scheduleSend(businessId, customerId, token);

    return reviewRequest;
  }

  /** Best-effort: a failure here should never roll back whatever created the review request. */
  async scheduleSend(
    businessId: string,
    customerId: string,
    token: string,
  ): Promise<void> {
    await this.sendGate
      .send({
        businessId,
        customerId,
        templateKey: 'review_request',
        scheduledFor: new Date(Date.now() + REVIEW_REQUEST_DELAY_MS),
        variables: { reviewUrl: `/r/${token}` },
      })
      .catch(() => undefined);
  }
}
