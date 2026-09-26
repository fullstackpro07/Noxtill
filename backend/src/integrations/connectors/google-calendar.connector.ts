import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { CalendarEventInput, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const EVENTS =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/**
 * Google Calendar connector — creates, updates and removes one event per Noxtill booking in the
 * connected account's primary calendar (`calendar.events` scope). Outbound only: events edited in
 * Google Calendar are not read back into Noxtill.
 */
@Injectable()
export class GoogleCalendarConnector extends GoogleOAuth2Connector {
  readonly provider = IntegrationProvider.google_calendar;
  protected readonly scope = 'https://www.googleapis.com/auth/calendar.events';

  constructor(config: ConfigService) {
    super(config);
  }

  private headers(tokens: OAuthTokens) {
    return { Authorization: `Bearer ${tokens.accessToken}` };
  }

  private body(event: CalendarEventInput) {
    return {
      summary: event.title,
      description: event.description,
      start: { dateTime: event.startsAt },
      end: { dateTime: event.endsAt },
    };
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://www.googleapis.com/calendar/v3/calendars/primary',
      { headers: this.headers(tokens) },
    );
    return response.data;
  }

  async createCalendarEvent(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    event: CalendarEventInput,
  ): Promise<{ externalId: string }> {
    const response = await axios.post<{ id: string }>(
      EVENTS,
      this.body(event),
      {
        headers: this.headers(tokens),
      },
    );
    return { externalId: response.data.id };
  }

  async updateCalendarEvent(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    externalId: string,
    event: CalendarEventInput,
  ): Promise<void> {
    await axios.patch(
      `${EVENTS}/${encodeURIComponent(externalId)}`,
      this.body(event),
      {
        headers: this.headers(tokens),
      },
    );
  }

  async deleteCalendarEvent(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    externalId: string,
  ): Promise<void> {
    await axios.delete(`${EVENTS}/${encodeURIComponent(externalId)}`, {
      headers: this.headers(tokens),
    });
  }
}
