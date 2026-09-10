import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Observable, concat, map } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { AppException } from '../common/filters/app.exception';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { DeliveryAssignmentService } from './delivery-assignment.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { RateDeliveryDto } from './dto/rate-delivery.dto';
import {
  ALLOWED_PROOF_IMAGE_MIME_TYPES,
  DELIVERY_ERROR_CODES,
  DELIVERY_STATUS_TRANSITIONS,
  MAX_PROOF_IMAGE_SIZE_BYTES,
  ON_TIME_TREND_DAYS,
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
    private readonly deliverySettings: DeliverySettingsService,
  ) {}

  list(status?: DeliveryStatus) {
    return this.tenantPrisma.client.delivery.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: { order: true, rider: true },
    });
  }

  /**
   * On-time-rate depth fix — real rate + daily trend, computed ONLY over deliveries that actually
   * had a real promise made (`promisedAt` not null) and reached a terminal outcome. Every delivery
   * assigned before this fix shipped has `promisedAt = null` and is honestly excluded, not
   * back-filled with a promise that was never really made. "On time" = delivered by the real
   * promised time; a failed delivery counts as not-on-time (it never arrived at all).
   */
  async onTimeStats(businessId: string) {
    const since = new Date(
      Date.now() - ON_TIME_TREND_DAYS * 24 * 60 * 60 * 1000,
    );
    const candidates = await this.tenantPrisma.client.delivery.findMany({
      where: {
        businessId,
        promisedAt: { not: null },
        status: { in: [DeliveryStatus.delivered, DeliveryStatus.failed] },
      },
      select: {
        status: true,
        deliveredAt: true,
        updatedAt: true,
        promisedAt: true,
      },
    });

    const isOnTime = (d: (typeof candidates)[number]) =>
      d.status === DeliveryStatus.delivered &&
      d.deliveredAt !== null &&
      d.promisedAt !== null &&
      d.deliveredAt.getTime() <= d.promisedAt.getTime();

    const onTimeCount = candidates.filter(isOnTime).length;
    const onTimeRate =
      candidates.length > 0
        ? Math.round((onTimeCount / candidates.length) * 10000) / 100
        : null;

    const byDay = new Map<string, { onTime: number; total: number }>();
    for (const d of candidates) {
      const at = d.deliveredAt ?? d.updatedAt;
      if (at < since) continue;
      const key = at.toISOString().slice(0, 10);
      const bucket = byDay.get(key) ?? { onTime: 0, total: 0 };
      bucket.total += 1;
      if (isOnTime(d)) bucket.onTime += 1;
      byDay.set(key, bucket);
    }
    const trend = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { onTime, total }]) => ({
        date,
        onTimeRate:
          total > 0 ? Math.round((onTime / total) * 10000) / 100 : null,
        sampleSize: total,
      }));

    return {
      onTimeRate,
      sampleSize: candidates.length,
      trend,
    };
  }

  async findOne(id: string) {
    const delivery = await this.tenantPrisma.client.delivery.findUnique({
      where: { id },
      include: { order: true, rider: true, route: true, zone: true },
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

    if (dto.zoneId) await this.requireZone(dto.zoneId);

    const delivery = await this.tenantPrisma.client.delivery.create({
      data: {
        businessId,
        orderId: dto.orderId,
        addressLine: dto.addressLine,
        lat: dto.lat,
        lng: dto.lng,
        zoneId: dto.zoneId,
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
            promisedAt: await this.computePromisedAt(
              businessId,
              delivery.zoneId,
            ),
          },
        })
      : delivery;

    await this.broadcast(businessId, assigned);
    return assigned;
  }

  async assign(businessId: string, id: string, dto: AssignDeliveryDto) {
    const delivery = await this.findOne(id);
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
        promisedAt: await this.computePromisedAt(businessId, delivery.zoneId),
      },
    });
    await this.broadcast(businessId, updated);
    return updated;
  }

  /**
   * On-time-rate depth fix, extended by the per-zone SLA depth fix — the real promise, made the
   * moment a rider is actually assigned. Uses the delivery's own zone's `slaMinutes` when the zone
   * has a real override set; otherwise falls back to the business's configured default.
   */
  private async computePromisedAt(
    businessId: string,
    zoneId?: string | null,
  ): Promise<Date> {
    let slaMinutes = await this.deliverySettings.getSlaMinutes(businessId);
    if (zoneId) {
      const zone = await this.tenantPrisma.client.deliveryZone.findUnique({
        where: { id: zoneId },
      });
      if (zone?.slaMinutes != null) slaMinutes = zone.slaMinutes;
    }
    return new Date(Date.now() + slaMinutes * 60 * 1000);
  }

  private async requireZone(zoneId: string) {
    const zone = await this.tenantPrisma.client.deliveryZone.findUnique({
      where: { id: zoneId },
    });
    if (!zone) throw new NotFoundException('Delivery zone not found');
    return zone;
  }

  /**
   * Per-zone SLA depth fix — sets (or clears) which zone a delivery belongs to. If the delivery
   * already has a rider (its promise was already made), the promise is honestly recomputed under
   * the new zone's real SLA rather than left stale.
   */
  async setZone(
    businessId: string,
    id: string,
    zoneId: string | null | undefined,
  ) {
    const delivery = await this.findOne(id);
    if (zoneId) await this.requireZone(zoneId);

    const updated = await this.tenantPrisma.client.delivery.update({
      where: { id },
      data: {
        zoneId: zoneId ?? null,
        ...(delivery.riderId
          ? { promisedAt: await this.computePromisedAt(businessId, zoneId) }
          : {}),
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
    // All Deliveries depth fix (UPD-FE-055e) — a failed delivery must record why, or the failure
    // list has nothing real to show.
    if (dto.status === 'failed' && !dto.failureReason?.trim()) {
      throw new AppException(
        DELIVERY_ERROR_CODES.FAILURE_REASON_REQUIRED,
        'A reason is required when marking a delivery as failed',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.tenantPrisma.client.delivery.update({
      where: { id },
      data: {
        status: dto.status as DeliveryStatus,
        ...(dto.status === 'delivered' ? { deliveredAt: new Date() } : {}),
        ...(dto.status === 'failed'
          ? { failureReason: dto.failureReason }
          : {}),
      },
    });
    await this.broadcast(businessId, updated);
    return updated;
  }

  /** Riders screen depth fix (UPD-FE-127) — real, staff-recorded quality rating, only for a delivery that has actually completed. */
  async rate(id: string, dto: RateDeliveryDto) {
    const delivery = await this.findOne(id);
    if (delivery.status !== DeliveryStatus.delivered) {
      throw new AppException(
        DELIVERY_ERROR_CODES.INVALID_STATUS_TRANSITION,
        'Only a delivered delivery can be rated',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.tenantPrisma.client.delivery.update({
      where: { id },
      data: { qualityRating: dto.rating },
    });
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

    // Live Tracking depth fix (UPD-FE-055) — every payload already carries a real `kind`
    // ('delivery_snapshot'/'delivery_update'/'rider_location'); without also setting the SSE
    // frame's own `type` here, the frontend's generic SSE client (which requires a named event,
    // matching `ActivityService.stream()`'s own convention) would silently drop every frame.
    return concat(snapshot$, live$).pipe(
      map((event) => ({ data: event, type: event.kind as string })),
    );
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
