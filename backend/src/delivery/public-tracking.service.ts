import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { DEFAULT_DELIVERY_SETTINGS } from './delivery.constants';

/**
 * What a customer sees at their tracking link. The token is unguessable and scoped to one
 * delivery. The rider's position is included only when the owner switched live-position sharing on
 * AND that rider personally consented AND the fix is fresh; proof of delivery only when the owner
 * switched that on. Nothing else about the rider (phone, cash, other stops) is ever exposed.
 */
@Injectable()
export class PublicTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async byToken(token: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { trackingToken: token },
      include: { order: true, rider: true, business: true },
    });
    if (!delivery) throw new NotFoundException('Tracking link not found');

    const settings = (await this.prisma.deliverySettings.findUnique({
      where: { businessId: delivery.businessId },
    })) ?? {
      ...DEFAULT_DELIVERY_SETTINGS,
      shareLiveLocation: false,
      sendProofToCustomer: false,
    };

    let position: { lat: number; lng: number; minutesAgo: number } | null =
      null;
    const r = delivery.rider;
    if (
      settings.shareLiveLocation &&
      r?.shareLocationConsent &&
      r.lastLat !== null &&
      r.lastLng !== null &&
      r.lastLocationAt &&
      ['assigned', 'picked_up', 'en_route'].includes(delivery.status)
    ) {
      const minutesAgo = Math.round(
        (Date.now() - r.lastLocationAt.getTime()) / 60000,
      );
      if (minutesAgo <= settings.staleLocationMinutes) {
        position = {
          lat: Number(r.lastLat),
          lng: Number(r.lastLng),
          minutesAgo,
        };
      }
    }

    let proof: { signatureUrl: string | null; photoUrl: string | null } | null =
      null;
    if (
      settings.sendProofToCustomer &&
      delivery.status === 'delivered' &&
      delivery.proofAt
    ) {
      proof = {
        signatureUrl: delivery.proofSignatureKey
          ? await this.s3.getSignedDownloadUrl(delivery.proofSignatureKey)
          : null,
        photoUrl: delivery.proofPhotoKey
          ? await this.s3.getSignedDownloadUrl(delivery.proofPhotoKey)
          : null,
      };
    }

    return {
      businessName: delivery.business.name,
      code: `DEL-${delivery.order.orderNo}`,
      status: delivery.status,
      address: delivery.addressLine,
      promisedAt: delivery.promisedAt,
      deliveredAt: delivery.deliveredAt,
      failureReason:
        delivery.status === 'failed' ? delivery.failureReason : null,
      riderFirstName: r ? r.name.split(' ')[0] : null,
      position,
      proof,
      shareLocationEnabled: settings.shareLiveLocation,
    };
  }
}
