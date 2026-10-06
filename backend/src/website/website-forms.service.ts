import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, WebsiteForm, WebsiteFormStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { normalizePhoneE164 } from '../common/utils/phone.util';
import { PrismaService } from '../prisma/prisma.service';
import { WEBSITE_ERRORS, WebsiteService, notFound } from './website.service';

export const FORM_FIELD_TYPES = [
  'text',
  'email',
  'phone',
  'textarea',
  'select',
  'checkbox',
] as const;
export const FORM_MAP_TARGETS = [
  'name',
  'phone',
  'email',
  'address',
  'notes',
] as const;
type FieldType = (typeof FORM_FIELD_TYPES)[number];
type MapTarget = (typeof FORM_MAP_TARGETS)[number];

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  mapTo: MapTarget;
}

/** Destinations Website can actually write to. Others are listed as unavailable in the UI. */
export const FORM_DESTINATIONS = [
  {
    key: 'crm_customer',
    label: 'CRM customer (create or update by phone)',
    available: true,
  },
] as const;
export const UNAVAILABLE_FORM_DESTINATIONS = [
  {
    key: 'booking_request',
    label: 'Booking request',
    reason:
      'Bookings need a chosen service and time; use a booking block that links to your booking page instead.',
  },
  {
    key: 'helpdesk_ticket',
    label: 'Helpdesk ticket',
    reason: 'There is no Helpdesk module in this workspace.',
  },
];

export interface FormInput {
  name?: string;
  fields?: unknown;
  customerTag?: string | null;
  consentText?: string | null;
  thankYouMessage?: string | null;
  status?: WebsiteFormStatus;
}

function bad(message: string): never {
  throw new AppException(
    WEBSITE_ERRORS.INVALID,
    message,
    HttpStatus.BAD_REQUEST,
  );
}

export function normalizeFields(input: unknown): FormField[] {
  if (!Array.isArray(input) || input.length === 0)
    bad('A form needs at least one field.');
  if (input.length > 25) bad('A form can have at most 25 fields.');
  const keys = new Set<string>();
  const mapped = new Set<MapTarget>();
  const fields = input.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const label =
      typeof r.label === 'string' ? r.label.trim().slice(0, 120) : '';
    if (!label) bad(`Field ${i + 1} needs a label.`);
    const type = r.type as FieldType;
    if (!FORM_FIELD_TYPES.includes(type))
      bad(`Field "${label}" has an unknown type.`);
    let key =
      typeof r.key === 'string' && /^[a-z0-9_]{1,40}$/.test(r.key)
        ? r.key
        : label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 40) || `field_${i + 1}`;
    if (keys.has(key)) key = `${key}_${i + 1}`;
    keys.add(key);
    const mapTo = (FORM_MAP_TARGETS as readonly string[]).includes(
      r.mapTo as string,
    )
      ? (r.mapTo as MapTarget)
      : 'notes';
    if (mapTo !== 'notes') {
      if (mapped.has(mapTo))
        bad(`Only one field can map to the customer's ${mapTo}.`);
      mapped.add(mapTo);
    }
    const options =
      type === 'select' && Array.isArray(r.options)
        ? r.options
            .map((o) => String(o).trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 30)
        : [];
    if (type === 'select' && options.length === 0)
      bad(`Dropdown "${label}" needs at least one option.`);
    return { key, label, type, required: r.required === true, options, mapTo };
  });
  // The CRM customer record needs a name and phone, so a form must collect both.
  const nameField = fields.find((f) => f.mapTo === 'name');
  const phoneField = fields.find((f) => f.mapTo === 'phone');
  if (!nameField?.required || !phoneField?.required) {
    bad(
      'Map one required field to the customer name and one required field to the phone number: the CRM needs both to create the customer.',
    );
  }
  return fields;
}

@Injectable()
export class WebsiteFormsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly website: WebsiteService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private summary(form: WebsiteForm) {
    return {
      id: form.id,
      name: form.name,
      fields: form.fields as unknown as FormField[],
      destination: form.destination,
      customerTag: form.customerTag,
      consentText: form.consentText,
      thankYouMessage: form.thankYouMessage,
      status: form.status,
      publicToken: form.publicToken,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    };
  }

  async list(businessId: string) {
    const site = await this.website.site(businessId);
    const forms = await this.db.websiteForm.findMany({
      where: { siteId: site.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    const since = new Date(Date.now() - 30 * 86_400_000);
    const grouped = await this.db.websiteFormSubmission.groupBy({
      by: ['formId', 'status'],
      where: {
        businessId,
        formId: { in: forms.map((f) => f.id) },
        isTest: false,
        createdAt: { gte: since },
      },
      _count: { _all: true },
    });
    const live = await this.website.liveSnapshot(site);
    const embeddedOn = new Map<string, string[]>();
    for (const page of live?.pages ?? []) {
      for (const block of page.blocks) {
        if (block.type === 'form' && typeof block.formId === 'string') {
          embeddedOn.set(block.formId, [
            ...(embeddedOn.get(block.formId) ?? []),
            page.title,
          ]);
        }
      }
    }
    const count = (formId: string, status: string) =>
      grouped.find((g) => g.formId === formId && g.status === status)?._count
        ._all ?? 0;
    return {
      forms: forms.map((f) => ({
        ...this.summary(f),
        last30Days: {
          accepted: count(f.id, 'accepted'),
          spamBlocked: count(f.id, 'spam_blocked'),
          failed: count(f.id, 'failed'),
        },
        livePages: embeddedOn.get(f.id) ?? [],
      })),
      destinations: FORM_DESTINATIONS,
      unavailableDestinations: UNAVAILABLE_FORM_DESTINATIONS,
    };
  }

  async submissions(businessId: string, formId: string) {
    const site = await this.website.site(businessId);
    const form = await this.db.websiteForm.findFirst({
      where: { id: formId, siteId: site.id },
    });
    if (!form) notFound('Form');
    const rows = await this.db.websiteFormSubmission.findMany({
      where: { formId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const customers = await this.db.customer.findMany({
      where: {
        businessId,
        id: {
          in: rows.map((r) => r.customerId).filter((id): id is string => !!id),
        },
      },
      select: { id: true, name: true },
    });
    const names = new Map(customers.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      isTest: r.isTest,
      customerId: r.customerId,
      customerName: r.customerId ? (names.get(r.customerId) ?? null) : null,
      createdCustomer: r.createdCustomer,
      marketingConsent: r.marketingConsent,
      errorReason: r.errorReason,
      utm: r.utm,
      createdAt: r.createdAt,
    }));
  }

  private fieldsFor(input: FormInput) {
    const data: Prisma.WebsiteFormUncheckedUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 120)
        bad('Form name must be 1–120 characters.');
      data.name = name;
    }
    if (input.fields !== undefined)
      data.fields = normalizeFields(
        input.fields,
      ) as unknown as Prisma.InputJsonValue;
    const opt = (v: string | null | undefined, max: number, label: string) => {
      if (v === undefined) return undefined;
      const t = (v ?? '').trim();
      if (t.length > max) bad(`${label} is longer than ${max} characters.`);
      return t || null;
    };
    if (input.customerTag !== undefined)
      data.customerTag = opt(input.customerTag, 60, 'Customer tag');
    if (input.consentText !== undefined)
      data.consentText = opt(input.consentText, 1000, 'Consent text');
    if (input.thankYouMessage !== undefined)
      data.thankYouMessage = opt(
        input.thankYouMessage,
        1000,
        'Thank-you message',
      );
    if (input.status !== undefined) data.status = input.status;
    return data;
  }

  async create(businessId: string, actorUserId: string, input: FormInput) {
    const site = await this.website.site(businessId);
    const data = this.fieldsFor(input);
    if (!data.name) bad('Form name is required.');
    if (!data.fields) bad('A form needs at least one field.');
    const form = await this.db.websiteForm.create({
      data: {
        ...(data as Prisma.WebsiteFormUncheckedCreateInput),
        businessId,
        siteId: site.id,
        destination: 'crm_customer',
        publicToken: randomBytes(18).toString('base64url'),
      },
    });
    await this.website.audit(
      this.db,
      businessId,
      actorUserId,
      'website.form.created',
      form.id,
      null,
      { name: form.name },
    );
    return this.summary(form);
  }

  async update(
    businessId: string,
    actorUserId: string,
    formId: string,
    input: FormInput,
  ) {
    const site = await this.website.site(businessId);
    const form = await this.db.websiteForm.findFirst({
      where: { id: formId, siteId: site.id },
    });
    if (!form) notFound('Form');
    if (
      input.status === WebsiteFormStatus.disabled &&
      form.status === WebsiteFormStatus.active
    ) {
      const live = await this.website.liveSnapshot(site);
      const used =
        live?.pages
          .filter((p) =>
            p.blocks.some((b) => b.type === 'form' && b.formId === form.id),
          )
          .map((p) => p.title) ?? [];
      if (used.length) {
        throw new AppException(
          WEBSITE_ERRORS.CONFLICT,
          `This form is on live page(s): ${used.join(', ')}. Remove it from those pages and publish first.`,
          HttpStatus.CONFLICT,
        );
      }
    }
    const updated = await this.db.websiteForm.update({
      where: { id: form.id },
      data: this.fieldsFor(input),
    });
    await this.website.audit(
      this.db,
      businessId,
      actorUserId,
      'website.form.changed',
      form.id,
      this.summary(form),
      this.summary(updated),
    );
    return this.summary(updated);
  }

  async duplicate(businessId: string, actorUserId: string, formId: string) {
    const site = await this.website.site(businessId);
    const form = await this.db.websiteForm.findFirst({
      where: { id: formId, siteId: site.id },
    });
    if (!form) notFound('Form');
    return this.create(businessId, actorUserId, {
      name: `${form.name} (copy)`.slice(0, 120),
      fields: form.fields,
      customerTag: form.customerTag,
      consentText: form.consentText,
      thankYouMessage: form.thankYouMessage,
    });
  }

  /**
   * Validates values against the form and works out the CRM write it would make. Pure: no writes.
   */
  private plan(
    form: WebsiteForm,
    values: Record<string, unknown>,
    country?: string | null,
  ) {
    const fields = form.fields as unknown as FormField[];
    const errors: string[] = [];
    const mapped: Partial<Record<MapTarget, string>> = {};
    const notes: string[] = [];
    for (const field of fields) {
      const raw = values[field.key];
      let value = '';
      if (field.type === 'checkbox')
        value =
          raw === true || raw === 'true'
            ? 'Yes'
            : raw === undefined || raw === null || raw === false
              ? ''
              : 'No';
      else if (typeof raw === 'string') value = raw.trim();
      else if (typeof raw === 'number') value = String(raw);
      if (value.length > (field.type === 'textarea' ? 4000 : 300))
        errors.push(`${field.label} is too long.`);
      if (field.required && !value) errors.push(`${field.label} is required.`);
      if (
        value &&
        field.type === 'email' &&
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
      )
        errors.push(`${field.label} must be an email address.`);
      if (value && field.type === 'select' && !field.options.includes(value))
        errors.push(`${field.label} has an invalid choice.`);
      if (!value) continue;
      if (field.mapTo === 'notes') notes.push(`${field.label}: ${value}`);
      else mapped[field.mapTo] = value;
    }
    let phone: string | undefined;
    if (mapped.phone) {
      phone = normalizePhoneE164(mapped.phone, country ?? undefined);
      if (!phone) errors.push('Phone number could not be understood.');
    }
    return { errors, mapped, notes, phone };
  }

  private async createOrUpdateCustomer(
    tx: Prisma.TransactionClient,
    businessId: string,
    form: WebsiteForm,
    plan: {
      mapped: Partial<Record<MapTarget, string>>;
      notes: string[];
      phone?: string;
    },
    marketingConsent: boolean,
  ) {
    const tag = form.customerTag || 'website-lead';
    const stamp = new Date().toISOString().slice(0, 10);
    const note = [`Website form "${form.name}" (${stamp})`, ...plan.notes].join(
      '\n',
    );
    const existing = await tx.customer.findFirst({
      where: { businessId, phone: plan.phone! },
    });
    if (existing) {
      const tags = Array.isArray(existing.tags)
        ? (existing.tags as string[])
        : [];
      await tx.customer.update({
        where: { id: existing.id },
        data: {
          email: existing.email ?? plan.mapped.email ?? null,
          address: existing.address ?? plan.mapped.address ?? null,
          notes: [existing.notes, note]
            .filter(Boolean)
            .join('\n\n')
            .slice(-60_000),
          tags: tags.includes(tag) ? tags : [...tags, tag],
          // Consent is only ever granted by an explicit tick; an unticked box never revokes it here.
          ...(marketingConsent
            ? { consentMarketing: true, optedOut: false }
            : {}),
        },
      });
      return { customerId: existing.id, created: false };
    }
    const customer = await tx.customer.create({
      data: {
        businessId,
        name: plan.mapped.name!.slice(0, 191),
        phone: plan.phone!,
        email: plan.mapped.email ?? null,
        address: plan.mapped.address ?? null,
        notes: note,
        tags: [tag],
        consentMarketing: marketingConsent,
      },
    });
    return { customerId: customer.id, created: true };
  }

  /** Dry run from the admin: shows exactly what a submission would write. Records a test row only. */
  async test(
    businessId: string,
    actorUserId: string,
    formId: string,
    values: Record<string, unknown>,
    marketingConsent: boolean,
  ) {
    const site = await this.website.site(businessId);
    const form = await this.db.websiteForm.findFirst({
      where: { id: formId, siteId: site.id },
    });
    if (!form) notFound('Form');
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { country: true },
    });
    const plan = this.plan(form, values, business.country);
    const existing = plan.phone
      ? await this.db.customer.findFirst({
          where: { businessId, phone: plan.phone },
          select: { id: true, name: true },
        })
      : null;
    await this.db.websiteFormSubmission.create({
      data: {
        businessId,
        formId: form.id,
        idempotencyKeyHash: createHash('sha256')
          .update(`test:${randomBytes(12).toString('hex')}`)
          .digest('hex'),
        status: plan.errors.length ? 'failed' : 'accepted',
        isTest: true,
        marketingConsent,
        consentTextShown: form.consentText,
        errorReason: plan.errors.join(' ').slice(0, 300) || null,
      },
    });
    return {
      valid: plan.errors.length === 0,
      errors: plan.errors,
      wouldWrite: plan.errors.length
        ? null
        : {
            action: existing ? 'update_existing_customer' : 'create_customer',
            existingCustomer: existing,
            name: plan.mapped.name ?? null,
            phone: plan.phone ?? null,
            email: plan.mapped.email ?? null,
            tag: form.customerTag || 'website-lead',
            notes: plan.notes,
            marketingConsent,
          },
      note: 'Test submissions never write to the CRM; they are logged as test rows.',
    };
  }

  // -------------------------------------------------------------------------------------------
  // Public

  async publicForm(token: string) {
    const form = await this.prisma.websiteForm.findUnique({
      where: { publicToken: token },
    });
    return this.publicView(form);
  }

  async publicFormById(businessId: string, formId: string) {
    const form = await this.prisma.websiteForm.findFirst({
      where: { id: formId, businessId },
    });
    return this.publicView(form);
  }

  private publicView(form: WebsiteForm | null) {
    if (!form || form.status !== WebsiteFormStatus.active) return null;
    return {
      token: form.publicToken,
      name: form.name,
      fields: (form.fields as unknown as FormField[]).map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
      })),
      consentText: form.consentText,
      thankYouMessage: form.thankYouMessage,
    };
  }

  /**
   * Public submission. Writes the canonical CRM customer once per idempotency key; spam (the
   * hidden honeypot field filled in) is logged and never reaches the CRM.
   */
  async submit(
    token: string,
    input: {
      values: Record<string, unknown>;
      idempotencyKey: string;
      marketingConsent?: boolean;
      company?: string;
      pageId?: string;
      utm?: Record<string, string>;
    },
  ) {
    const form = await this.prisma.websiteForm.findUnique({
      where: { publicToken: token },
    });
    if (!form || form.status !== WebsiteFormStatus.active) {
      throw new AppException(
        WEBSITE_ERRORS.NOT_FOUND,
        'This form is not available.',
        HttpStatus.NOT_FOUND,
      );
    }
    const keyHash = createHash('sha256')
      .update(input.idempotencyKey)
      .digest('hex');
    const previous = await this.prisma.websiteFormSubmission.findUnique({
      where: {
        formId_idempotencyKeyHash: {
          formId: form.id,
          idempotencyKeyHash: keyHash,
        },
      },
    });
    if (previous) return this.publicResult(form, previous.status);

    const utm = Object.fromEntries(
      Object.entries(input.utm ?? {})
        .filter(
          ([k, v]) =>
            /^utm_(source|medium|campaign|term|content)$/.test(k) &&
            typeof v === 'string',
        )
        .map(([k, v]) => [k, v.slice(0, 120)]),
    );
    const marketingConsent =
      !!form.consentText && input.marketingConsent === true;
    const base = {
      businessId: form.businessId,
      formId: form.id,
      idempotencyKeyHash: keyHash,
      marketingConsent,
      consentTextShown: form.consentText,
      pageId:
        typeof input.pageId === 'string' ? input.pageId.slice(0, 64) : null,
      utm,
    };

    if (input.company) {
      await this.recordOnce({ ...base, status: 'spam_blocked' });
      return this.publicResult(form, 'accepted');
    }

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: form.businessId },
      select: { country: true },
    });
    const plan = this.plan(form, input.values ?? {}, business.country);
    if (plan.errors.length) {
      throw new AppException(
        WEBSITE_ERRORS.INVALID,
        plan.errors.join(' '),
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const written = await this.createOrUpdateCustomer(
          tx,
          form.businessId,
          form,
          plan,
          marketingConsent,
        );
        await tx.websiteFormSubmission.create({
          data: {
            ...base,
            status: 'accepted',
            customerId: written.customerId,
            createdCustomer: written.created,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Same key submitted twice at once: the first one won; report the stored outcome.
        const stored = await this.prisma.websiteFormSubmission.findUnique({
          where: {
            formId_idempotencyKeyHash: {
              formId: form.id,
              idempotencyKeyHash: keyHash,
            },
          },
        });
        if (stored) return this.publicResult(form, stored.status);
      }
      await this.recordOnce({
        ...base,
        status: 'failed',
        errorReason:
          error instanceof Error
            ? error.message.slice(0, 300)
            : 'Unknown error',
      });
      throw new AppException(
        WEBSITE_ERRORS.CONFLICT,
        'We could not save your message. Please try again.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.publicResult(form, 'accepted');
  }

  private async recordOnce(
    data: Prisma.WebsiteFormSubmissionUncheckedCreateInput,
  ) {
    try {
      await this.prisma.websiteFormSubmission.create({ data });
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ))
        throw error;
    }
  }

  private publicResult(form: WebsiteForm, status: string) {
    return {
      received: status !== 'failed',
      message: form.thankYouMessage || 'Thanks, we received your message.',
    };
  }
}
