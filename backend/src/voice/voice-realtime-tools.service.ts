import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { AppointmentSource, Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppointmentsService } from '../bookings/appointments.service';
import { PublicBookingService } from '../bookings/public-booking.service';
import type { RealtimeAgentConfig } from './voice-realtime.service';
import { CustomerCommunicationsService } from '../messaging/customer-communications.service';

const definitions = {
  support_ticket: {
    description:
      'Create a real support ticket after verifying the caller with their private booking-management reference and getting keypad confirmation. Do not invent a review rating.',
    properties: {
      bookingToken: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['bookingToken', 'title', 'body'],
  },
  inbox_draft: {
    description:
      'Create a message draft for staff review after verifying the caller with their private booking-management reference and keypad confirmation. This does not send any message.',
    properties: { bookingToken: { type: 'string' }, body: { type: 'string' } },
    required: ['bookingToken', 'body'],
  },
  catalog: {
    description: 'Read the active business services and their recorded prices.',
    properties: {},
  },
  slots: {
    description: 'Read real available slots for a service and date.',
    properties: { serviceId: { type: 'string' }, date: { type: 'string' } },
    required: ['serviceId', 'date'],
  },
  customer_lookup: {
    description:
      'Check whether this caller number exists in this business. Caller ID is not verified identity; no sensitive details are returned.',
    properties: {},
  },
  book: {
    description:
      'Request a booking. The server asks the caller to press 1 before writing it. A saved request may still need staff approval or a deposit: only say confirmed if the returned booking status is confirmed.',
    properties: {
      serviceId: { type: 'string' },
      startsAt: { type: 'string' },
      customerName: { type: 'string' },
    },
    required: ['serviceId', 'startsAt', 'customerName'],
  },
  reschedule: {
    description:
      'Request a booking change using the customer’s existing private booking-management token. The server asks for DTMF confirmation.',
    properties: {
      bookingToken: { type: 'string' },
      startsAt: { type: 'string' },
    },
    required: ['bookingToken', 'startsAt'],
  },
  message: {
    description:
      'Save this call for staff follow-up, then end it after saying goodbye.',
    properties: {},
  },
  transfer: {
    description:
      'Request the configured human team. Never promise that someone has answered.',
    properties: {},
  },
  end: { description: 'End the call after saying goodbye.', properties: {} },
} as const;
export type RealtimeToolName = keyof typeof definitions;

export function realtimeToolDefinitions(config: RealtimeAgentConfig) {
  return Object.entries(definitions)
    .filter(([name]) => (config.toolPermissions ?? []).includes(name))
    .map(([name, def]) => ({
      type: 'function',
      name,
      description: def.description,
      parameters: {
        type: 'object',
        properties: def.properties,
        required: 'required' in def ? def.required : [],
        additionalProperties: false,
      },
    }));
}

@Injectable()
export class VoiceRealtimeToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly publicBooking: PublicBookingService,
    private readonly cls: ClsService,
    @Optional() private readonly communications?: CustomerCommunicationsService,
  ) {}

  async execute(
    sessionId: string,
    requestId: string,
    name: string,
    args: Record<string, unknown>,
    confirmed = false,
  ) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(requestId))
      throw this.invalid('The tool request identifier is invalid.');
    const session = await this.prisma.voiceRealtimeSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { call: { include: { voiceAgentVersion: true } } },
    });
    const call = session.call;
    const controls = call.voiceAgentVersion?.config as
      RealtimeAgentConfig | undefined;
    if (
      session.status !== 'active' ||
      call.status !== 'in_progress' ||
      !controls?.toolPermissions?.includes(name) ||
      !(name in definitions)
    )
      throw new AppException(
        'VOICE_AI_TOOL_DENIED',
        'This action is not allowed by the pinned agent version.',
        HttpStatus.FORBIDDEN,
      );
    const tool = name as RealtimeToolName;
    const spec = definitions[tool];
    const required: readonly string[] = 'required' in spec ? spec.required : [];
    if (
      Object.keys(args).some((key) => !(key in spec.properties)) ||
      required.some((key) => {
        const value = args[key];
        return typeof value !== 'string' || !value.trim();
      }) ||
      Object.entries(args).some(
        ([key, value]) =>
          typeof value !== 'string' ||
          value.length > (key === 'body' ? 2000 : key === 'title' ? 160 : 200),
      )
    )
      throw new AppException(
        'VOICE_AI_TOOL_INPUT_INVALID',
        'The action arguments are invalid.',
        HttpStatus.BAD_REQUEST,
      );
    if (
      ['book', 'reschedule', 'support_ticket', 'inbox_draft'].includes(tool) &&
      !confirmed
    )
      return {
        status: 'confirmation_required',
        instruction:
          tool === 'book'
            ? `Read back the service and time ${String(args.startsAt)} and ask the caller to press 1 to confirm, or 2 to cancel.`
            : tool === 'reschedule'
              ? `Read back the new time ${String(args.startsAt)} and ask the caller to press 1 to confirm, or 2 to cancel.`
              : 'Read back the support request or message draft, then ask the caller to press 1 to save it or 2 to cancel. A draft is not sent.',
        requestId,
      };
    const eventKey = `tool:${session.id}:${requestId}`;
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM phone_calls WHERE id = ${call.id} FOR UPDATE`;
      const previous = await tx.voiceUsageRecord.findUnique({
        where: {
          businessId_eventKey: { businessId: call.businessId, eventKey },
        },
      });
      if (previous) return { previous };
      const count = await tx.voiceUsageRecord.count({
        where: {
          businessId: call.businessId,
          callId: call.id,
          unit: 'tool_invocation',
        },
      });
      if (count >= (controls.maxToolCalls ?? 10))
        throw new AppException(
          'VOICE_AI_TOOL_LIMIT_REACHED',
          'This call has reached its tool limit. Offer staff follow-up.',
          HttpStatus.FORBIDDEN,
        );
      await tx.voiceUsageRecord.create({
        data: {
          businessId: call.businessId,
          callId: call.id,
          eventKey,
          provider: 'noxtill',
          unit: 'tool_invocation',
          quantity: 1,
          state: 'pending',
          evidence: { tool, confirmed },
        },
      });
      return { previous: null };
    });
    if (claimed.previous)
      return {
        status: claimed.previous.state,
        evidence: claimed.previous.evidence,
      };
    try {
      const business = await this.prisma.business.findUniqueOrThrow({
        where: { id: call.businessId },
        select: { slug: true, timezone: true },
      });
      let result: unknown;
      switch (tool) {
        case 'support_ticket':
        case 'inbox_draft':
          if (!this.communications)
            throw this.invalid(
              'Customer communication storage is unavailable. Offer staff follow-up.',
            );
          result = await this.communications.createFromVerifiedCall(
            call.businessId,
            call.id,
            eventKey,
            {
              kind: tool,
              bookingToken: String(args.bookingToken),
              title: typeof args.title === 'string' ? args.title : undefined,
              body: String(args.body),
            },
          );
          break;
        case 'catalog':
          result = await this.prisma.product.findMany({
            where: {
              businessId: call.businessId,
              kind: 'service',
              active: true,
            },
            select: {
              id: true,
              name: true,
              sellingPrice: true,
              durationMin: true,
            },
            orderBy: { id: 'asc' },
            take: 30,
          });
          break;
        case 'slots':
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.date)))
            throw this.invalid('Use a calendar date in YYYY-MM-DD format.');
          result = await this.publicBooking.getSlots(business.slug, {
            service: String(args.serviceId),
            date: String(args.date),
          });
          break;
        case 'customer_lookup':
          result = {
            exists: Boolean(
              await this.prisma.customer.findFirst({
                where: { businessId: call.businessId, phone: call.fromNumber },
                select: { id: true },
              }),
            ),
            identityVerified: false,
          };
          break;
        case 'book': {
          const startsAt = new Date(String(args.startsAt));
          if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date())
            throw this.invalid('Choose a future booking time.');
          const date = new Intl.DateTimeFormat('en-CA', {
            timeZone: business.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(startsAt);
          const slots = await this.publicBooking.getSlots(business.slug, {
            service: String(args.serviceId),
            date,
          });
          if (!slots.slots.includes(startsAt.toISOString()))
            throw this.invalid('That time is not an available booking slot.');
          const appointment = await this.cls.run(async () => {
            this.cls.set(CLS_KEY_BUSINESS_ID, call.businessId);
            return this.appointments.createWalkIn(
              call.businessId,
              {
                serviceId: String(args.serviceId),
                startsAt: startsAt.toISOString(),
                customerPhone: call.fromNumber,
                customerName: String(args.customerName),
              },
              AppointmentSource.phone,
            );
          });
          await this.prisma.phoneCall.update({
            where: { id: call.id },
            data: { appointmentId: appointment.id, outcome: 'booking' },
          });
          result = {
            appointmentId: appointment.id,
            bookingNo: appointment.bookingNo,
            startsAt: appointment.startsAt.toISOString(),
            status: appointment.status,
            message:
              appointment.status === 'requested'
                ? 'Booking request saved. Staff must review it and arrange any required deposit. Do not say it is confirmed.'
                : 'Booking confirmed by the Bookings service.',
          };
          break;
        }
        case 'reschedule': {
          const startsAt = new Date(String(args.startsAt));
          if (!Number.isFinite(startsAt.getTime()))
            throw this.invalid('Choose a valid booking time.');
          const verified = await this.prisma.appointment.findFirst({
            where: {
              businessId: call.businessId,
              rescheduleToken: String(args.bookingToken),
              customer: { phone: call.fromNumber },
              status: { notIn: ['cancelled', 'completed'] },
            },
            select: { id: true },
          });
          if (!verified)
            throw this.invalid(
              'The existing booking could not be verified. Transfer to staff.',
            );
          const appointment = await this.publicBooking.reschedule(
            String(args.bookingToken),
            startsAt.toISOString(),
            { phone: true },
          );
          result = {
            appointmentId: appointment.id,
            bookingNo: appointment.bookingNo,
            startsAt: appointment.startsAt.toISOString(),
            status: appointment.status,
            message:
              appointment.status === 'requested'
                ? 'The time change is saved for staff review. Do not say the booking is confirmed.'
                : 'The booking time change was confirmed by Bookings.',
          };
          break;
        }
        case 'message':
          await this.prisma.phoneCall.update({
            where: { id: call.id },
            data: { outcome: 'message' },
          });
          result = { followUpSaved: true, transition: 'end' };
          break;
        case 'transfer':
          result = {
            transition: 'transfer',
            status: 'requested',
            connected: false,
          };
          break;
        case 'end':
          result = { transition: 'end' };
          break;
      }
      await this.prisma.voiceUsageRecord.update({
        where: {
          businessId_eventKey: { businessId: call.businessId, eventKey },
        },
        data: {
          state: 'completed',
          evidence: { tool, confirmed, result } as Prisma.InputJsonValue,
        },
      });
      await this.prisma.auditLog.create({
        data: {
          businessId: call.businessId,
          entity: 'PhoneCall',
          entityId: call.id,
          action: 'voice.ai_tool.executed',
          after: { tool, requestId, confirmed },
        },
      });
      return { status: 'completed', result };
    } catch (error) {
      const body =
        error instanceof AppException
          ? (error.getResponse() as { code?: string; message?: string })
          : null;
      const result = {
        code: body?.code ?? 'VOICE_TOOL_FAILED',
        message:
          body?.message ??
          'The action could not be confirmed. Ask staff to follow up.',
      };
      await this.prisma.voiceUsageRecord.update({
        where: {
          businessId_eventKey: { businessId: call.businessId, eventKey },
        },
        data: { state: 'failed', evidence: { tool, result } },
      });
      return { status: 'failed', ...result };
    }
  }

  private invalid(message: string) {
    return new AppException(
      'VOICE_AI_TOOL_INPUT_INVALID',
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
