import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';

/** Canonical customer support and message drafts, also used by the authenticated call workspace. */
@Injectable()
export class CustomerCommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
  ) {}

  async createFromVerifiedCall(
    businessId: string,
    callId: string,
    sourceKey: string,
    input: {
      kind: 'support_ticket' | 'inbox_draft';
      bookingToken: string;
      title?: string;
      body: string;
    },
  ) {
    const call = await this.prisma.phoneCall.findFirst({
      where: { id: callId, businessId, status: 'in_progress' },
    });
    const verified = call
      ? await this.prisma.appointment.findFirst({
          where: {
            businessId,
            rescheduleToken: input.bookingToken,
            customer: { phone: call.fromNumber },
          },
          select: { customerId: true },
        })
      : null;
    if (!call || !verified)
      throw new AppException(
        'VOICE_CUSTOMER_VERIFICATION_REQUIRED',
        'The customer could not be verified. Ask for the private booking-management reference or transfer to staff.',
        HttpStatus.FORBIDDEN,
      );
    const body = input.body.trim();
    if (
      !body ||
      body.length > 2000 ||
      (input.kind === 'support_ticket' &&
        (!input.title?.trim() || input.title.length > 160))
    )
      throw new AppException(
        'CUSTOMER_COMMUNICATION_INVALID',
        'Enter a valid title and message (up to 2,000 characters).',
        HttpStatus.BAD_REQUEST,
      );
    const unique = { businessId_sourceKey: { businessId, sourceKey } };
    const data = {
      businessId,
      customerId: verified.customerId,
      sourceCallId: callId,
      sourceKey,
      body,
    };
    const record =
      input.kind === 'support_ticket'
        ? await this.prisma.customerSupportTicket.upsert({
            where: unique,
            update: {},
            create: { ...data, title: input.title!.trim() },
          })
        : await this.prisma.messageDraft.upsert({
            where: unique,
            update: {},
            create: data,
          });
    return {
      id: record.id,
      kind: input.kind,
      status: record.status,
      sent: false,
    };
  }

  async forCall(businessId: string, callId: string) {
    if (
      !(await this.tenant.client.phoneCall.findFirst({
        where: { id: callId, businessId },
        select: { id: true },
      }))
    )
      throw new AppException(
        'VOICE_CALL_NOT_FOUND',
        'Call not found.',
        HttpStatus.NOT_FOUND,
      );
    const [tickets, drafts] = await Promise.all([
      this.tenant.client.customerSupportTicket.findMany({
        where: { businessId, sourceCallId: callId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          body: true,
          status: true,
          createdAt: true,
        },
      }),
      this.tenant.client.messageDraft.findMany({
        where: { businessId, sourceCallId: callId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, body: true, status: true, createdAt: true },
      }),
    ]);
    return { tickets, drafts };
  }
}
