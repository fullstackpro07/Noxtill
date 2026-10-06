import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  ConsentRecordDto,
  LEGAL_FORM_ROUTES,
  LegalFormDto,
} from './dto/legal-public.dto';

/** Field ids the public Legal & Trust forms send, with the label used in the delivered email. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  relationship: 'Relationship with Noxtill',
  requestType: 'Request type',
  region: 'Region',
  country: 'Country of residence',
  address: 'Address',
  business: 'Business / workspace',
  company: 'Business name',
  organization: 'Organization',
  phone: 'Phone',
  topic: 'Topic',
  subject: 'Subject',
  workspace: 'Workspace / account ID',
  correlation: 'Correlation ID',
  page: 'Page or feature',
  task: 'What they were trying to do',
  at: 'Assistive technology and browser',
  details: 'Details',
};

const MAX_VALUE = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CATEGORY_KEYS = ['necessary', 'functional', 'analytics', 'advertising'];

export interface PublicStatus {
  summary: string;
  checkedAt: string;
  components: { name: string; status: 'operational' | 'outage' }[];
  incidents: never[];
}

/**
 * Backs the public Legal & Trust pages: contact/privacy/accessibility/opt-out forms are emailed to
 * the route's Noxtill inbox (same Resend HTTP API as `BookDemoService` — an anonymous visitor has no
 * tenant, so the tenant-scoped messaging channel doesn't apply), website privacy choices are stored
 * as consent evidence, and the status page reads a live API + database check.
 */
@Injectable()
export class LegalPublicService {
  private readonly logger = new Logger(LegalPublicService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async submitForm(dto: LegalFormDto): Promise<{ inbox: string }> {
    const route = LEGAL_FORM_ROUTES[dto.route];
    if (dto.website) return { inbox: route.inbox }; // Honeypot tripped — accept silently.

    const fields: Record<string, string> = {};
    for (const [key, raw] of Object.entries(dto.fields ?? {})) {
      if (!(key in FIELD_LABELS) || typeof raw !== 'string') continue;
      const value = raw.trim().slice(0, MAX_VALUE);
      if (value) fields[key] = value;
    }
    const visitorEmail = fields.email;
    if (!visitorEmail || !EMAIL_RE.test(visitorEmail)) {
      throw new AppException(
        'LEGAL_FORM_EMAIL_INVALID',
        'Enter a valid email address so we can reply.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const lines = Object.entries(fields).map(([k, v]) =>
      k === 'details' || k === 'task'
        ? `${FIELD_LABELS[k]}:\n${v}`
        : `${FIELD_LABELS[k]}: ${v}`,
    );
    if (dto.authorizedAgent !== undefined)
      lines.push(
        `Submitted by an authorized agent: ${dto.authorizedAgent ? 'Yes' : 'No'}`,
      );
    if (dto.gpc) lines.push('Global Privacy Control signal: detected');
    lines.push(`Submitted from: noxtill.com${dto.page ?? ''}`);

    const subjectHint =
      fields.subject ?? fields.topic ?? fields.requestType ?? fields.name;
    await this.send({
      to: route.inbox,
      replyTo: visitorEmail,
      subject: `[${route.label}] ${subjectHint ?? visitorEmail}`.slice(0, 200),
      text: lines.join('\n\n'),
      context: `${dto.route} form from ${visitorEmail}`,
    });
    return { inbox: route.inbox };
  }

  async recordConsent(
    dto: ConsentRecordDto,
  ): Promise<{ id: string; createdAt: Date }> {
    const raw = dto.categories;
    const categories = raw
      ? Object.fromEntries(
          CATEGORY_KEYS.filter((k) => k in raw).map((k) => [
            k,
            raw[k] === true,
          ]),
        )
      : undefined;
    return this.prisma.legalConsentRecord.create({
      data: {
        consentId: dto.consentId,
        kind: dto.kind,
        region: dto.region ?? null,
        policyVersion: dto.policyVersion,
        categories,
        optedOut: dto.optedOut ?? null,
        language: dto.language ?? null,
        source: dto.source,
        gpc: dto.gpc === true,
      },
      select: { id: true, createdAt: true },
    });
  }

  /** Only the components this check can actually observe are reported; the page marks the rest "Not monitored". */
  async status(): Promise<PublicStatus> {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      this.logger.error(
        'Status check: database unreachable',
        err instanceof Error ? err.stack : err,
      );
    }
    return {
      summary: dbOk
        ? 'API and database operational'
        : 'Database unreachable — service disruption',
      checkedAt: new Date().toISOString(),
      components: [
        { name: 'API', status: 'operational' },
        { name: 'Database', status: dbOk ? 'operational' : 'outage' },
      ],
      incidents: [],
    };
  }

  private async send(p: {
    to: string;
    replyTo: string;
    subject: string;
    text: string;
    context: string;
  }): Promise<void> {
    const apiKey = this.config.get<string>('EMAIL_PROVIDER_KEY');
    const from = this.config.get<string>('EMAIL_FROM_ADDRESS');
    if (!apiKey || !from) {
      this.logger.error(
        `Email provider not configured — undelivered ${p.context}:\n${p.text}`,
      );
      throw new AppException(
        'LEGAL_FORM_DELIVERY_UNAVAILABLE',
        `We couldn't send your message just now. Please email ${p.to} directly.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    try {
      await axios.post(
        'https://api.resend.com/emails',
        {
          from,
          to: p.to,
          reply_to: p.replyTo,
          subject: p.subject,
          text: p.text,
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );
    } catch (err) {
      // Never surface the raw provider error (its request config carries the API key).
      this.logger.error(
        `Failed to deliver ${p.context}`,
        err instanceof Error ? err.stack : err,
      );
      this.logger.error(`Undelivered ${p.context}:\n${p.text}`);
      throw new AppException(
        'LEGAL_FORM_DELIVERY_FAILED',
        `We couldn't send your message just now. Please try again, or email ${p.to} directly.`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
