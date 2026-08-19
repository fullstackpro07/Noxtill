import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Observable, concat, map } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { AppException } from '../common/filters/app.exception';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { DeliveryAssignmentService } from './delivery-assignment.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import {
  ALLOWED_PROOF_IMAGE_MIME_TYPES,
  DELIVERY_ERROR_CODES,
  DELIVERY_STATUS_TRANSITIONS,
  MAX_PROOF_IMAGE_SIZE_BYTES,
  deliveryChannel,
} from './delivery.constants';
import { Delivery, DeliveryStatus } from '@prisma/client';

export interface ProofFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** Delivery assignment + live tracking (UPD-BE-065) and proof of delivery (UPD-BE-067). */
@Injectable()
export class DeliveriesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly pubsub: ActivityPubSubService,
    private readonly assignment: DeliveryAssignmentService,
  ) {}

  list(status?: DeliveryStatus) {
    return this.tenantPrisma.client.delivery.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: { order: true, rider: true },
    });
  }

  async findOne(id: string) {
    const delivery = await this.tenantPrisma.client.delivery.findUnique({
      where: { id },
      include: { order: true, rider: true, route: true },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  async create(businessId: string, dto: CreateDeliveryDto) {
    const order = await this.tenantPrisma.client.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    const existing = await this.tenantPrisma.client.delivery.findUnique({
      where: { orderId: dto.orderId },
    });
    if (existing) {
      throw new AppException(
        DELIVERY_ERROR_CODES.ORDER_ALREADY_HAS_DELIVERY,
        'This order already has a delivery',
        HttpStatus.CONFLICT,
      );
    }

    const delivery = await this.tenantPrisma.client.delivery.create({
      data: {
        businessId,
        orderId: dto.orderId,
        addressLine: dto.addressLine,
        lat: dto.lat,
        lng: dto.lng,
      },
    });

    const riderId = await this.assignment.pickRider();
    const assigned = riderId
      ? await this.tenantPrisma.client.delivery.update({
          where: { id: delivery.id },
          data: {
            riderId,
            status: DeliveryStatus.assigned,
            assignedAt: new Date(),
          },
        })
      : delivery;

    await this.broadcast(businessId, assigned);
    return assigned;
  }

  async assign(businessId: string, id: string, dto: AssignDeliveryDto) {
    await this.findOne(id);
    const rider = await this.tenantPrisma.client.rider.findUnique({
      where: { id: dto.riderId },
    });
    if (!rider) throw new NotFoundException('Rider not found');

    const updated = await this.tenantPrisma.client.delivery.update({
      where: { id },
      data: {
        riderId: rider.id,
        status: DeliveryStatus.assigned,
        assignedAt: new Date(),
      },
    });
    await this.broadcast(businessId, updated);
    return updated;
  }

  async updateStatus(
    businessId: string,
    id: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    const delivery = await this.findOne(id);
    const allowed = DELIVERY_STATUS_TRANSITIONS[delivery.status];
    if (!allowed.includes(dto.status)) {
      throw new AppException(
        DELIVERY_ERROR_CODES.INVALID_STATUS_TRANSITION,
        `Cannot move a delivery from "${delivery.status}" to "${dto.status}"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.tenantPrisma.client.delivery.update({
      where: { id },
      data: {
        status: dto.status as DeliveryStatus,
        ...(dto.status === 'delivered' ? { deliveredAt: new Date() } : {}),
      },
    });
    await this.broadcast(businessId, updated);
    return updated;
  }

  /** Proof of Delivery (UPD-BE-067) — real S3-backed signature/photo + GPS, marks the delivery delivered. */
  async submitProof(
    businessId: string,
    id: string,
    signature: ProofFile,
    photo: ProofFile | undefined,
    lat: number,
    lng: number,
  ) {
    const delivery = await this.findOne(id);
    if (delivery.proofAt) {
      throw new AppException(
        DELIVERY_ERROR_CODES.DELIVERY_ALREADY_HAS_PROOF,
        'Proof of delivery has already been submitted for this delivery',
        HttpStatus.CONFLICT,
      );
    }

    const rules = {
      allowedMimeTypes: ALLOWED_PROOF_IMAGE_MIME_TYPES,
      maxSizeBytes: MAX_PROOF_IMAGE_SIZE_BYTES,
    };
    await validateUploadedFile(signature, rules);
    if (photo) await validateUploadedFile(photo, rules);

    const signatureKey = `deliveries/${businessId}/${id}/signature-${Date.now()}`;
    await this.s3.upload(signatureKey, signature.buffer, signature.mimetype);

    let photoKey: string | undefined;
    if (photo) {
      photoKey = `deliveries/${businessId}/${id}/photo-${Date.now()}`;
      await this.s3.upload(photoKey, photo.buffer, photo.mimetype);
    }

    const updated = await this.tenantPrisma.client.delivery.update({
      where: { id },
      data: {
        proofSignatureKey: signatureKey,
        proofPhotoKey: photoKey,
        proofLat: lat,
        proofLng: lng,
        proofAt: new Date(),
        status: DeliveryStatus.delivered,
        deliveredAt: new Date(),
      },
    });
    await this.broadcast(businessId, updated);
    return updated;
  }

  async getProof(id: string) {
    const delivery = await this.findOne(id);
    if (!delivery.proofSignatureKey) {
      return { submitted: false };
    }
    return {
      submitted: true,
      signatureUrl: await this.s3.getSignedDownloadUrl(
        delivery.proofSignatureKey,
      ),
      photoUrl: delivery.proofPhotoKey
        ? await this.s3.getSignedDownloadUrl(delivery.proofPhotoKey)
        : null,
      lat: delivery.proofLat ? Number(delivery.proofLat) : null,
      lng: delivery.proofLng ? Number(delivery.proofLng) : null,
      at: delivery.proofAt,
    };
  }

  /** `GET /deliveries/live` — current snapshot first, then live-tails status/location updates. */
  stream(businessId: string): Observable<MessageEvent> {
    const snapshot$ = new Observable<Record<string, unknown>>((subscriber) => {
      this.list()
        .then((deliveries) => {
          for (const delivery of deliveries) {
            if (
              delivery.status === 'unassigned' ||
              delivery.status === 'delivered' ||
              delivery.status === 'failed'
            ) {
              continue;
            }
            subscriber.next({
              kind: 'delivery_snapshot',
              ...this.toPayload(delivery),
            });
          }
          subscriber.complete();
        })
        .catch((error: Error) => subscriber.error(error));
    });

    const live$ = this.pubsub.subscribe<Record<string, unknown>>(
      deliveryChannel(businessId),
    );

    return concat(snapshot$, live$).pipe(map((event) => ({ data: event })));
  }

  private async broadcast(
    businessId: string,
    delivery: Delivery,
  ): Promise<void> {
    await this.pubsub.publish(deliveryChannel(businessId), {
      kind: 'delivery_update',
      ...this.toPayload(delivery),
    });
  }

  private toPayload(delivery: Delivery) {
    return {
      id: delivery.id,
      status: delivery.status,
      riderId: delivery.riderId,
      lat: delivery.lat ? Number(delivery.lat) : null,
      lng: delivery.lng ? Number(delivery.lng) : null,
    };
  }
}
