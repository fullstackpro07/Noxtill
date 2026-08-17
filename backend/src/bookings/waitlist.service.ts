import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { assertSlotAvailable } from './booking-lock.util';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';
import { OfferWaitlistEntryDto } from './dto/offer-waitlist-entry.dto';
import { WAITLIST_ERROR_CODES } from './bookings.constants';
import {
  AppointmentSource,
  AppointmentStatus,
  Prisma,
  WaitlistStatus,
} from '@prisma/client';

interface FreedSlot {
  serviceId: string;
  staffUserId: string | null;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Waiting List (UPD-BE-017). `tryAutoOffer` is called from both cancellation paths
 * (`AppointmentsService.updateStatus` and `PublicBookingService.cancel`) right after a
 * cancellation commits — it's best-effort by design (matches `ActivityService.record`'s
 * never-throws convention) so a waitlist-matching failure can never block a real cancellation.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  async join(businessId: string, dto: CreateWaitlistEntryDto) {
    const service = await this.tenantPrisma.client.product.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const customer = await this.tenantPrisma.client.customer.upsert({
      where: { businessId_phone: { businessId, phone: dto.customerPhone } },
      create: {
        businessId,
        phone: dto.customerPhone,
        name: dto.customerName,
      },
      update: {},
    });

    return this.tenantPrisma.client.waitlistEntry.create({
      data: {
        customerId: customer.id,
        serviceId: dto.serviceId,
        staffUserId: dto.staffId,
        preferredFrom: dto.preferredFrom
          ? new Date(dto.preferredFrom)
          : undefined,
        preferredTo: dto.preferredTo ? new Date(dto.preferredTo) : undefined,
      } as Prisma.WaitlistEntryUncheckedCreateInput,
      include: { customer: true, service: true },
    });
  }

  list(status?: WaitlistStatus) {
    return this.tenantPrisma.client.waitlistEntry.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      include: { customer: true, service: true },
    });
  }

  /** Manually offer a specific slot (also called internally by `tryAutoOffer`). */
  async offer(businessId: string, id: string, dto: OfferWaitlistEntryDto) {
    const entry = await this.findWithStatus(id, WaitlistStatus.waiting);

    const updated = await this.tenantPrisma.client.waitlistEntry.update({
      where: { id },
      data: {
        status: WaitlistStatus.offered,
        offeredStartsAt: new Date(dto.startsAt),
        offeredEndsAt: new Date(dto.endsAt),
      },
      include: { service: true },
    });

    await this.sendGate
      .send({
        businessId,
        customerId: entry.customerId,
        templateKey: 'waitlist_offer',
        variables: {
          serviceName: updated.service.name,
          dateTime: updated.offeredStartsAt!.toISOString(),
        },
      })
      .catch(() => undefined);

    return updated;
  }

  /** Converts an accepted offer into a real, confirmed appointment via the same slot-lock path every other booking uses. */
  async accept(businessId: string, id: string) {
    const entry = await this.findWithStatus(id, WaitlistStatus.offered);
    const startsAt = entry.offeredStartsAt!;
    const endsAt = entry.offeredEndsAt!;

    const appointment = await this.tenantPrisma.client.$transaction(
      async (tx) => {
        await assertSlotAvailable(tx, {
          businessId,
          staffId: entry.staffUserId,
          serviceId: entry.serviceId,
          startsAt,
          endsAt,
        });

        return tx.appointment.create({
          data: {
            businessId,
            serviceId: entry.serviceId,
            staffUserId: entry.staffUserId,
            customerId: entry.customerId,
            startsAt,
            endsAt,
            status: AppointmentStatus.confirmed,
            source: AppointmentSource.waitlist,
          },
          include: { service: true, customer: true },
        });
      },
    );

    await this.tenantPrisma.client.waitlistEntry.update({
      where: { id },
      data: { status: WaitlistStatus.booked },
    });

    return appointment;
  }

  async cancel(id: string) {
    await this.findEntry(id);
    return this.tenantPrisma.client.waitlistEntry.update({
      where: { id },
      data: { status: WaitlistStatus.cancelled },
    });
  }

  /** Best-effort — never throws, so a cancellation always completes even if this step fails. */
  async tryAutoOffer(businessId: string, freed: FreedSlot): Promise<void> {
    try {
      const candidate = await this.tenantPrisma.client.waitlistEntry.findFirst({
        where: {
          businessId,
          serviceId: freed.serviceId,
          status: WaitlistStatus.waiting,
          OR: [
            { staffUserId: null },
            ...(freed.staffUserId ? [{ staffUserId: freed.staffUserId }] : []),
          ],
          AND: [
            {
              OR: [
                { preferredFrom: null },
                { preferredFrom: { lte: freed.startsAt } },
              ],
            },
            {
              OR: [
                { preferredTo: null },
                { preferredTo: { gte: freed.endsAt } },
              ],
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!candidate) return;

      await this.offer(businessId, candidate.id, {
        startsAt: freed.startsAt.toISOString(),
        endsAt: freed.endsAt.toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Waitlist auto-offer skipped for business ${businessId}: ${(error as Error).message}`,
      );
    }
  }

  private async findEntry(id: string) {
    const entry = await this.tenantPrisma.client.waitlistEntry.findUnique({
      where: { id },
    });
    if (!entry) {
      throw new NotFoundException('Waitlist entry not found');
    }
    return entry;
  }

  private async findWithStatus(id: string, status: WaitlistStatus) {
    const entry = await this.findEntry(id);
    if (entry.status !== status) {
      throw new AppException(
        status === WaitlistStatus.waiting
          ? WAITLIST_ERROR_CODES.NOT_WAITING
          : WAITLIST_ERROR_CODES.NOT_OFFERED,
        `Waitlist entry is "${entry.status}", expected "${status}"`,
        HttpStatus.CONFLICT,
      );
    }
    return entry;
  }
}
