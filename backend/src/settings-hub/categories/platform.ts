import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/filters/app.exception';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, HubValue, row, RowDef, plural } from '../hub.core';
import { HubDeps, LANGUAGES, asJson, business, currencies, timezones, updateBusiness } from './hub.deps';

const bad = (message: string) => new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);
const str = (v: HubValue, max = 191): string => {
  const s = String(v).trim();
  if (s.length > max) throw bad(`Keep this to ${max} characters or fewer.`);
  return s;
};

const PROFILE = CAPABILITIES.BUSINESS_PROFILE_MANAGE;

export function platformCategories(d: HubDeps): CategoryDef[] {
  const currencyRow = (): RowDef =>
    row({
      key: 'currency',
      label: 'Currency',
      description: 'Display currency for prices, receipts and reports. Changing it does not convert stored amounts.',
      risk: 'High',
      impact: 'Existing amounts keep their recorded value and simply display with the new currency. Noxtill never converts historical figures.',
      requires: PROFILE,
      state: async (ctx) => {
        const b = await business(d, ctx);
        return { value: b.currency, control: { type: 'select', current: b.currency, options: currencies().map((c) => ({ value: c, label: c })) } };
      },
      write: async (ctx, v) => {
        const code = str(v, 3).toUpperCase();
        if (!currencies().includes(code)) throw bad('That is not a supported currency code.');
        await updateBusiness(d, ctx, { currency: code });
      },
    });

  const timezoneRow = (): RowDef =>
    row({
      key: 'timezone',
      label: 'Timezone',
      description: 'Decides what counts as today for every daily figure, schedule and reminder.',
      risk: 'High',
      impact: 'Changing this shifts the boundary of every daily, weekly and monthly figure, including reports and reminders scheduled by local time.',
      requires: PROFILE,
      state: async (ctx) => {
        const b = await business(d, ctx);
        return { value: b.timezone, control: { type: 'select', current: b.timezone, options: timezones().map((z) => ({ value: z, label: z })) } };
      },
      write: async (ctx, v) => {
        const z = str(v);
        if (!timezones().includes(z)) throw bad('That is not a supported timezone.');
        await updateBusiness(d, ctx, { timezone: z });
      },
    });

  const languageRow = (): RowDef =>
    row({
      key: 'locale',
      label: 'Language',
      description: 'Language and number/date conventions used in receipts, reports and customer messages.',
      risk: 'Medium',
      impact: 'Numbers, dates and currency formatting in new receipts, reports and messages follow this language. Documents already issued do not change.',
      requires: PROFILE,
      reset: { label: 'English', value: 'en' },
      state: async (ctx) => {
        const b = await business(d, ctx);
        const label = LANGUAGES.find((l) => l.value === b.locale)?.label ?? b.locale;
        return { value: label, control: { type: 'select', current: b.locale, options: LANGUAGES } };
      },
      write: async (ctx, v) => {
        const code = str(v, 8);
        if (!LANGUAGES.some((l) => l.value === code)) throw bad('That language is not available.');
        await updateBusiness(d, ctx, { locale: code });
      },
    });

  const countryRow = (): RowDef =>
    row({
      key: 'country',
      label: 'Country',
      description: 'Where the business operates. Shown on documents; it does not change tax or currency by itself.',
      requires: PROFILE,
      state: async (ctx) => {
        const b = await business(d, ctx);
        return { value: b.country ?? 'Not set', tone: b.country ? 'neutral' : 'amber', control: { type: 'text', current: b.country ?? '', maxLength: 100 } };
      },
      write: async (ctx, v) => updateBusiness(d, ctx, { country: str(v, 100) || null }),
    });

  return [
    {
      key: 'home',
      label: 'Settings Home',
      title: 'Settings Home',
      icon: 'activity',
      group: 'Platform',
      description: 'Configuration health across the system, what changed recently, and the settings you reach for most.',
      affects: ['Every module'],
      affectsNote: 'Each health area links to the exact setting it concerns. Nothing here is fixed automatically.',
      help: [
        'Health is a summary of measured configuration state, not a score.',
        'An area reads Needs attention only when a specific, nameable item is wrong.',
        'Recent changes come from the audit log, which is append-only.',
      ],
      actions: [],
      groups: [],
    },
    {
      key: 'general',
      label: 'General',
      title: 'General',
      icon: 'sliders-horizontal',
      group: 'Platform',
      description: 'Regional preferences for how Noxtill displays and reports. These affect presentation, not the underlying business data.',
      affects: ['Every module', 'Reports', 'Receipts'],
      affectsNote: 'Timezone decides what counts as today across the whole system, so changing it shifts every daily figure.',
      help: [
        'Presentation settings never alter a stored value — a currency change does not convert existing amounts.',
        'Timezone is the exception: it changes how periods are grouped everywhere.',
        'Only languages Noxtill can actually render are offered.',
      ],
      actions: [
        { label: 'Reset section', icon: 'rotate-ccw', kind: 'reset' },
        { label: 'View history', icon: 'history', kind: 'history' },
      ],
      groups: [
        { title: 'Regional', hint: 'Applies across every module', rows: [languageRow(), timezoneRow(), currencyRow(), countryRow()],
          footer: 'Timezone and currency are the two settings here that change how figures are grouped or displayed everywhere.' },
      ],
    },
    {
      key: 'language',
      label: 'Language & Localization',
      title: 'Language & Localization',
      icon: 'languages',
      group: 'Platform',
      description: 'Language, region and the effective number and date format. The effective combination is shown so nothing is ambiguous.',
      affects: ['Interface', 'Reports', 'Receipts', 'Exports'],
      affectsNote: 'Language changes number and date conventions in exports as well as on screen, which matters for accounting imports.',
      help: [
        'Only implemented languages appear. Noxtill does not list a language it cannot render.',
        'Formats follow the language and currency — they are not separate free-form settings.',
        'Changing a format never converts a stored value.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        { title: 'Language and region', hint: 'Only implemented languages', rows: [languageRow(), timezoneRow(), currencyRow()] },
        {
          title: 'Effective format',
          hint: 'Computed from your language, currency and timezone',
          footer: 'Formats are derived from the language and currency above, so getting them right means choosing those two correctly.',
          rows: [
            row({
              key: 'effective-number',
              label: 'Number and currency',
              description: 'How an amount will actually appear on a receipt or report.',
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: new Intl.NumberFormat(b.locale, { style: 'currency', currency: b.currency }).format(1284600.5) };
              },
            }),
            row({
              key: 'effective-date',
              label: 'Date and time',
              description: 'How a date and time render in your timezone.',
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: new Intl.DateTimeFormat(b.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: b.timezone }).format(ctx.now) };
              },
            }),
          ],
        },
      ],
    },
    {
      key: 'business',
      label: 'Business Profile',
      title: 'Business Profile',
      icon: 'building-2',
      group: 'Platform',
      description: 'Your business identity as customers see it — on receipts, invoices, reports, messages and your public pages.',
      affects: ['Receipts', 'Invoices', 'Reports', 'Booking page', 'Messages'],
      affectsNote: 'The name here appears on everything customer-facing, so a change is immediately visible externally.',
      help: [
        'Changing the profile does not alter documents already issued.',
        'Branch profiles are separate — each branch keeps its own name, phone and address.',
        'Only fields Noxtill stores are shown; a logo for receipts is not stored, so none is offered.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        {
          title: 'Identity',
          hint: 'Appears on customer-facing documents',
          rows: [
            row({
              key: 'name',
              label: 'Business name',
              description: 'Trading name shown on receipts, messages and your public pages.',
              risk: 'Medium',
              impact: 'This name appears on every receipt, invoice, report and customer message issued from now on. Documents already issued keep the old name.',
              requires: PROFILE,
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: b.name, control: { type: 'text', current: b.name, maxLength: 191 } };
              },
              write: async (ctx, v) => {
                const name = str(v);
                if (!name) throw bad('The business name cannot be empty.');
                await updateBusiness(d, ctx, { name });
              },
            }),
            row({
              key: 'type',
              label: 'Business type',
              description: 'Shapes which modules and terminology Noxtill emphasises. Set when the account was created.',
              state: async (ctx) => {
                const b = await d.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, include: { type: true } });
                return { value: b.type?.label ?? 'Not set', tone: b.type ? 'neutral' : 'amber' };
              },
            }),
          ],
        },
        {
          title: 'Contact',
          hint: 'Shown to customers',
          rows: [
            row({
              key: 'phone',
              label: 'Phone',
              description: 'Appears on receipts and your public pages.',
              requires: PROFILE,
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: b.phone ?? 'Not set', tone: b.phone ? 'neutral' : 'amber', control: { type: 'text', current: b.phone ?? '', maxLength: 40 } };
              },
              write: async (ctx, v) => updateBusiness(d, ctx, { phone: str(v, 40) || null }),
            }),
            row({
              key: 'address',
              label: 'Address',
              description: 'Used on invoices and tax documents.',
              risk: 'Medium',
              requires: PROFILE,
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: b.address ?? 'Not set', tone: b.address ? 'neutral' : 'amber', control: { type: 'text', current: b.address ?? '', maxLength: 191 } };
              },
              write: async (ctx, v) => updateBusiness(d, ctx, { address: str(v) || null }),
            }),
          ],
        },
        {
          title: 'Terminology and options',
          hint: 'Edited in their own screens',
          rows: [
            row({ key: 'labels', label: 'Terminology labels', description: 'Rename what Noxtill calls things (for example customers or appointments) to match your business.', requires: CAPABILITIES.LABELS_MANAGE, link: { label: 'Edit terminology', href: '/settings/tools/labels' }, state: () => ({ value: 'Open editor' }) }),
            row({ key: 'options', label: 'Custom options', description: 'The lists and choices offered in dropdowns across Noxtill.', requires: CAPABILITIES.OPTIONS_MANAGE, link: { label: 'Edit options', href: '/settings/tools/options' }, state: () => ({ value: 'Open editor' }) }),
          ],
        },
        {
          title: 'Public pages',
          hint: 'Reviews and booking',
          rows: [
            row({
              key: 'public-review-url',
              label: 'Public review link',
              description: 'Where happy customers are sent to leave a public review.',
              requires: PROFILE,
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: b.publicReviewUrl ?? 'Not set', tone: b.publicReviewUrl ? 'neutral' : 'amber', control: { type: 'text', current: b.publicReviewUrl ?? '', placeholder: 'https://', maxLength: 500 } };
              },
              write: async (ctx, v) => {
                const url = str(v, 500);
                if (url && !/^https?:\/\//i.test(url)) throw bad('Enter a full link starting with http:// or https://.');
                await updateBusiness(d, ctx, { publicReviewUrl: url || null });
              },
            }),
            row({
              key: 'booking-welcome',
              label: 'Booking page welcome text',
              description: 'The message at the top of your public booking page.',
              requires: CAPABILITIES.BOOKINGS_MANAGE,
              state: async (ctx) => {
                const s = await d.prisma.bookingLinkSettings.findUnique({ where: { businessId: ctx.businessId } });
                return { value: s?.welcomeText ? `${s.welcomeText.length} characters` : 'Not set', tone: s?.welcomeText ? 'neutral' : 'amber', control: { type: 'text', current: s?.welcomeText ?? '', maxLength: 500 } };
              },
              write: async (ctx, v) => {
                const welcomeText = str(v, 500) || null;
                await d.prisma.bookingLinkSettings.upsert({ where: { businessId: ctx.businessId }, create: { businessId: ctx.businessId, welcomeText }, update: { welcomeText } });
              },
            }),
            row({
              key: 'booking-color',
              label: 'Booking page brand colour',
              description: 'Accent colour on your public booking page, as a hex code.',
              requires: CAPABILITIES.BOOKINGS_MANAGE,
              state: async (ctx) => {
                const s = await d.prisma.bookingLinkSettings.findUnique({ where: { businessId: ctx.businessId } });
                return { value: s?.brandColor ?? 'Default', control: { type: 'text', current: s?.brandColor ?? '', placeholder: '#12A150', maxLength: 7 } };
              },
              write: async (ctx, v) => {
                const brandColor = str(v, 7) || null;
                if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) throw bad('Enter a colour like #12A150.');
                await d.prisma.bookingLinkSettings.upsert({ where: { businessId: ctx.businessId }, create: { businessId: ctx.businessId, brandColor }, update: { brandColor } });
              },
            }),
          ],
        },
      ],
    },
    {
      key: 'branches',
      label: 'Branches & Locations',
      title: 'Branches & Locations',
      icon: 'building',
      group: 'Platform',
      description: 'Branch defaults and how each branch is configured. Branch records themselves live in the Branches module.',
      affects: ['Branches', 'Bookings', 'Inventory', 'Sales', 'Reports'],
      affectsNote: 'Each branch is its own business record with its own settings, so a change here applies to the branch you have selected.',
      help: [
        'Noxtill does not duplicate branch management here — this links to the module that owns it.',
        'A branch keeps its own copy of currency, timezone, tax and hours; it does not inherit a global value.',
        '“Copy settings” in the Branches module aligns one branch with another.',
      ],
      notice: { text: 'Branch records live in the Branches module. This section summarises how each location is configured.', icon: 'info', action: { label: 'Open Branches', href: '/branches' } },
      actions: [{ label: 'Manage branches', icon: 'external-link', primary: true, href: '/branches', kind: 'link' }],
      groups: [
        {
          title: 'Branch summary',
          hint: 'Records are owned by the Branches module',
          rows: [
            row({
              key: 'branch-count',
              label: 'Branches',
              description: 'Locations in this business group.',
              link: { label: 'Open Branches', href: '/branches/all' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                const rootId = b.parentId ?? b.id;
                const all = await d.prisma.business.findMany({ where: { OR: [{ id: rootId }, { parentId: rootId }] }, select: { active: true } });
                const active = all.filter((x) => x.active).length;
                return { value: `${all.length} · ${active} active` };
              },
            }),
          ],
        },
        {
          title: 'Each location',
          hint: 'Its own configuration, not inherited',
          dynamicRows: async (ctx) => {
            const b = await business(d, ctx);
            const rootId = b.parentId ?? b.id;
            const all = await d.prisma.business.findMany({ where: { OR: [{ id: rootId }, { parentId: rootId }] }, orderBy: { createdAt: 'asc' } });
            return all.map((x) =>
              row({
                key: `branch:${x.id}`,
                label: x.id === rootId ? `${x.name} (main)` : x.name,
                description: `${x.currency} · ${x.timezone} · ${x.taxLabel} ${Number(x.taxRate)}% · nightly close ${x.nightlyCloseTime}`,
                link: { label: 'Open branch settings', href: '/branches/settings' },
                state: () => ({ value: x.active ? 'Active' : 'Inactive', tone: x.active ? 'green' : 'neutral' }),
              }),
            );
          },
          footer: 'Where a branch differs from another, the value shown here is that branch’s own — Noxtill does not silently pick a global value.',
        },
      ],
    },
  ];
}

void asJson;
void plural;
