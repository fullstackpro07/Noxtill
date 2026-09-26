import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationsService } from '../integrations.service';
import { ConnectorRegistry } from '../connector-registry';
import { SyncLogService } from './sync-log.service';
import { AppointmentStatus, IntegrationProvider, Prisma } from '@prisma/client';

export const BOOKING_SYNC_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.google_calendar,
  IntegrationProvider.outlook,
  IntegrationProvider.zoom,
];
const WINDOW_BACK_MS = 86_400_000;
const WINDOW_AHEAD_MS = 90 * 86_400_000;
const BATCH = 100;
const ACTIVE = [AppointmentStatus.booked, AppointmentStatus.confirmed];

interface StoredEvent {
  id: string;
  startsAt: string;
  endsAt: string;
}
type StoredEvents = Partial<Record<string, StoredEvent>>;

export interface BookingSyncResult {
  provider: string;
  created: number;
  updated: number;
  removed: number;
  failed: number;
}

/**
 * Keeps one calendar event (Google Calendar / Outlook) or one Zoom meeting per Noxtill booking.
 * It reconciles from the bookings themselves, on a schedule and on "Sync now", instead of hooking
 * every code path that can create or move a booking — so a booking made through the public link, a
 * walk-in, a reschedule, the waitlist or a request approval is all picked up the same way. What was
 * created for each booking (and the times it was created for) is stored on the appointment, which
 * is how a later move or cancellation updates or removes the same event. A customer's phone and
 * email are never put in an event.
 */
@Injectable()
export class BookingSyncService {
  private readonly logger = new Logger(BookingSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
    private readonly runs: SyncLogService,
  ) {}

  /** Scheduled tick — every business with a connected, unpaused calendar/Zoom integration. */
  async runAll(): Promise<void> {
    const rows = await this.prisma.integration.findMany({
      where: {
        provider: { in: BOOKING_SYNC_PROVIDERS },
        status: 'connected',
        pausedAt: null,
      },
      select: { businessId: true, provider: true },
    });
    for (const row of rows) {
      await this.sync(row.businessId, row.provider, { quiet: true }).catch(
        (error: Error) =>
          this.logger.warn(
            `Booking sync failed for business=${row.businessId} provider=${row.provider}: ${error.message}`,
          ),
      );
    }
  }

  async sync(
    businessId: string,
    provider: IntegrationProvider,
    opts: { quiet?: boolean; manual?: boolean } = {},
  ): Promise<BookingSyncResult> {
    const startedAt = Date.now();
    const integration = opts.manual
      ? await this.runs.requireRunnable(businessId, provider)
      : await this.runs.runnable(businessId, provider);
    const result: BookingSyncResult = {
      provider,
      created: 0,
      updated: 0,
      removed: 0,
      failed: 0,
    };
    if (!integration) return result;

    const connector = this.connectors.get(provider);
    const tokens = await this.integrations.getTokens(businessId, provider);
    if (!tokens) return result;
    const meta = (integration.meta as Record<string, unknown>) ?? {};
    const isZoom = provider === IntegrationProvider.zoom;

    const now = Date.now();
    const appointments = await this.prisma.appointment.findMany({
      where: {
        businessId,
        OR: [
          {
            status: { in: ACTIVE },
            startsAt: {
              gte: new Date(now - WINDOW_BACK_MS),
              lte: new Date(now + WINDOW_AHEAD_MS),
            },
          },
          // Cancelled bookings that still hold an event are cleaned up (calendars only).
          ...(isZoom
            ? []
            : [
                {
                  status: AppointmentStatus.cancelled,
                  calendarEventIds: { not: Prisma.DbNull },
                },
              ]),
        ],
      },
      include: {
        service: { select: { name: true, durationMin: true } },
        customer: { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: BATCH,
    });

    let lastError: string | null = null;
    for (const a of appointments) {
      const stored = (a.calendarEventIds as StoredEvents | null) ?? {};
      const mine = stored[provider];
      const startsAt = a.startsAt.toISOString();
      const endsAt = a.endsAt.toISOString();
      const title = `${a.service.name} — ${a.customer.name}`;
      const description = `Booked in Noxtill${a.bookingNo ? ` (BK-${a.bookingNo})` : ''}`;
      try {
        if (a.status === AppointmentStatus.cancelled) {
          if (mine && connector.deleteCalendarEvent) {
            await connector.deleteCalendarEvent(tokens, meta, mine.id);
            const { [provider]: _removed, ...rest } = stored;
            await this.prisma.appointment.update({
              where: { id: a.id },
              data: {
                calendarEventIds: Object.keys(rest).length
                  ? (rest as Prisma.InputJsonValue)
                  : Prisma.DbNull,
              },
            });
            result.removed += 1;
          }
          continue;
        }
        if (isZoom) {
          if (mine || !connector.createMeeting) continue;
          const minutes = Math.max(
            15,
            Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60000),
          );
          const meeting = await connector.createMeeting(tokens, meta, {
            topic: title,
            startsAt,
            durationMinutes: minutes,
          });
          await this.prisma.appointment.update({
            where: { id: a.id },
            data: {
              meetingUrl: meeting.joinUrl,
              calendarEventIds: {
                ...stored,
                [provider]: { id: meeting.externalId, startsAt, endsAt },
              },
            },
          });
          result.created += 1;
          continue;
        }
        if (!mine && connector.createCalendarEvent) {
          const created = await connector.createCalendarEvent(tokens, meta, {
            title,
            description,
            startsAt,
            endsAt,
          });
          await this.prisma.appointment.update({
            where: { id: a.id },
            data: {
              calendarEventIds: {
                ...stored,
                [provider]: { id: created.externalId, startsAt, endsAt },
              } as Prisma.InputJsonValue,
            },
          });
          result.created += 1;
        } else if (
          mine &&
          (mine.startsAt !== startsAt || mine.endsAt !== endsAt) &&
          connector.updateCalendarEvent
        ) {
          await connector.updateCalendarEvent(tokens, meta, mine.id, {
            title,
            description,
            startsAt,
            endsAt,
          });
          await this.prisma.appointment.update({
            where: { id: a.id },
            data: {
              calendarEventIds: {
                ...stored,
                [provider]: { ...mine, startsAt, endsAt },
              } as Prisma.InputJsonValue,
            },
          });
          result.updated += 1;
        }
      } catch (error) {
        result.failed += 1;
        lastError = (error as Error).message;
      }
    }

    const acted =
      result.created + result.updated + result.removed + result.failed;
    if (acted > 0 || !opts.quiet) {
      const parts = [
        result.created && `${result.created} created`,
        result.updated && `${result.updated} updated`,
        result.removed && `${result.removed} removed`,
        result.failed &&
          `${result.failed} failed${lastError ? ` (${lastError.slice(0, 200)})` : ''}`,
      ].filter(Boolean);
      await this.runs.record(businessId, provider, {
        startedAt,
        success: result.failed === 0,
        processed: result.created + result.updated + result.removed,
        failed: result.failed,
        message: parts.length
          ? parts.join(', ')
          : 'Everything is already up to date',
      });
    }
    return result;
  }
}
