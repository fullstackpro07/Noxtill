import { HttpStatus } from '@nestjs/common';
import { CustomerMatchOn } from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, HubValue, row, RowDef, plural } from '../hub.core';
import { HubDeps, monthStart } from './hub.deps';
import { capabilityRow } from './access';
import { policyRow } from './policy-rows';

const bad = (message: string) => new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);

const DAY_LABELS: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export function operationsCategories(d: HubDeps): CategoryDef[] {
  const privacyToggle = (key: string, label: string, description: string, field: 'staffCanExport' | 'staffCanMerge' | 'staffCanArchive' | 'creditBalanceVisibleToStaff', impact: string): RowDef =>
    row({
      key,
      label,
      description,
      risk: 'High',
      impact,
      requires: CAPABILITIES.CUSTOMERS_MANAGE,
      reset: { label: 'Off', value: false },
      state: async (ctx) => {
        const s = await d.prisma.customerPrivacySettings.findUnique({ where: { businessId: ctx.businessId } });
        const on = s ? s[field] : false;
        return { value: on ? 'On' : 'Off', tone: on ? 'amber' : 'green', control: { type: 'toggle', on } };
      },
      write: async (ctx, v: HubValue) => {
        await d.prisma.customerPrivacySettings.upsert({ where: { businessId: ctx.businessId }, create: { businessId: ctx.businessId, [field]: Boolean(v) }, update: { [field]: Boolean(v) } });
      },
    });

  return [
    {
      key: 'sales',
      label: 'Sales & POS',
      title: 'Sales & POS',
      icon: 'shopping-cart',
      group: 'Operations',
      description: 'How Fast Sale behaves at the counter. Every limit below is enforced by the server, not just hidden in the screen.',
      affects: ['Fast Sale', 'Orders', 'Quotations', 'Products', 'Staff', 'Reports'],
      affectsNote: 'Limits apply to new sales only. Owners are never limited, and a person holding the matching override permission can step past a limit.',
      help: [
        'Discount limits count the discount typed at the counter; coupons you configured are not counted against it.',
        'A return needs someone holding the approve-returns permission before any refund happens.',
        'Every completed sale is written to the audit log.',
      ],
      actions: [{ label: 'Open Fast Sale', icon: 'external-link', href: '/sales', kind: 'link' }],
      groups: [
        {
          title: 'Counter behaviour',
          hint: 'Enforced in Fast Sale',
          rows: [
            policyRow(d, {
              key: 'sale-stock',
              policy: 'sales.allowNegativeStock',
              kind: 'toggle',
              label: 'Allow selling more than is in stock',
              description: 'When off, a sale or order that would take stock below zero is refused. When on, stock is allowed to go negative.',
              risk: 'High',
              impact: 'Stock figures can go negative and cost of sales will be based on stock you may not have.',
              on: { text: 'Allowed', tone: 'amber' },
              off: { text: 'Blocked', tone: 'green' },
            }),
            policyRow(d, {
              key: 'sale-customer',
              policy: 'sales.requireCustomer',
              kind: 'toggle',
              label: 'Require a customer on every sale',
              description: 'A sale or order cannot be completed without a customer attached. Saved drafts are not affected.',
              risk: 'Medium',
              on: { text: 'Required', tone: 'blue' },
              off: { text: 'Optional', tone: 'neutral' },
            }),
            policyRow(d, {
              key: 'sale-tax-inclusive',
              policy: 'sales.pricesIncludeTax',
              kind: 'toggle',
              label: 'Prices include tax',
              description: 'When on, the price of a product already contains its tax: tax is taken out of the price instead of being added on top, for sales, tables, quotations and online orders.',
              risk: 'High',
              impact: 'Applies to new orders only; existing orders keep how they were priced. Totals customers pay do not change — only the split between price and tax.',
              on: { text: 'Tax included in prices', tone: 'blue' },
              off: { text: 'Tax added on top', tone: 'neutral' },
            }),
            row({ key: 'sale-credit', label: 'Credit sales', description: 'A sale on credit must be linked to a customer.', state: () => ({ value: 'Customer required', tone: 'green' }) }),
            row({ key: 'sale-cash', label: 'Cash register', description: 'Cash shifts are opened and closed from the register.', link: { label: 'Open register', href: '/sales' }, state: () => ({ value: 'One open shift at a time' }) }),
            row({
              key: 'sale-receipts',
              label: 'Receipts this month',
              description: 'Receipts issued digitally and printed.',
              state: async (ctx) => {
                const rows = await d.prisma.receiptLog.groupBy({ by: ['channel'], where: { businessId: ctx.businessId, createdAt: { gte: monthStart(ctx.now) } }, _count: { _all: true } });
                const n = (c: string) => rows.find((r) => r.channel === c)?._count._all ?? 0;
                return { value: `${n('digital')} digital · ${n('print')} printed` };
              },
            }),
          ],
        },
        {
          title: 'Discounts and overrides',
          hint: 'Enforced when set',
          footer: 'A limit stops people without the override permission. Anyone holding it, and the owner, can go past it.',
          rows: [
            policyRow(d, {
              key: 'discount-limit',
              policy: 'sales.maxDiscountPercent',
              kind: 'number',
              label: 'Maximum discount',
              description: 'The most a team member may take off a sale at the counter, as a percentage of the sale subtotal. Empty means no limit.',
              risk: 'High',
              impact: 'Anyone without the discount-override permission is stopped above this percentage.',
              unit: '%',
              format: (n) => `${n}%`,
              emptyLabel: 'No limit',
              step: 1,
              tone: (n) => (n === null ? 'amber' : 'green'),
            }),
            capabilityRow(d, { key: CAPABILITIES.DISCOUNT_OVERRIDE, label: 'Go past the discount limit', description: 'Who may give a discount above the maximum.', impact: 'Lets a person discount as much as they like, whatever the limit says.' }),
            policyRow(d, {
              key: 'price-override',
              policy: 'sales.restrictPriceOverride',
              kind: 'toggle',
              label: 'Restrict price changes at the counter',
              description: 'When on, changing a line price away from the catalogue price needs the price-override permission.',
              risk: 'High',
              impact: 'Without the permission, a sale with a changed price is refused.',
              on: { text: 'Restricted', tone: 'green' },
              off: { text: 'Any role', tone: 'amber' },
            }),
            capabilityRow(d, { key: CAPABILITIES.PRICE_OVERRIDE, label: 'Change prices at the counter', description: 'Who may sell at a price other than the catalogue price when price changes are restricted.', impact: 'Lets a person sell below or above the listed price.' }),
            capabilityRow(d, { key: CAPABILITIES.PRICING_MANAGE, label: 'Bulk price changes', description: 'Changing prices across many products at once.', impact: 'Changes what customers pay for many products at once.' }),
          ],
        },
        {
          title: 'Returns',
          hint: 'Permission, limit and fixed rule',
          rows: [
            policyRow(d, {
              key: 'return-limit',
              policy: 'returns.refundLimit',
              kind: 'number',
              label: 'Refund limit needing the owner',
              description: 'A refund above this amount can only be approved by the owner, even by someone who may approve returns. Empty means no limit.',
              risk: 'High',
              impact: 'Managers cannot approve a refund larger than this.',
              format: (n) => n.toFixed(2),
              emptyLabel: 'No limit',
              step: 1,
              tone: (n) => (n === null ? 'amber' : 'green'),
            }),
            policyRow(d, {
              key: 'return-original',
              policy: 'returns.refundToOriginalMethod',
              kind: 'toggle',
              label: 'Refund the way the customer paid',
              description: 'When on, a return must be refunded by the method the order was paid with (cash back for cash, and so on).',
              risk: 'Medium',
              on: { text: 'Original method only', tone: 'green' },
              off: { text: 'Any method', tone: 'neutral' },
            }),
            capabilityRow(d, { key: CAPABILITIES.RETURNS_APPROVE, label: 'Approve returns', description: 'Who may approve a pending return and its refund.', impact: 'Approving a return refunds money and puts stock back.' }),
            row({ key: 'return-amount', label: 'Refund amount', description: 'Recomputed from the order’s recorded prices, so a refund can never exceed what was sold.', risk: 'High', state: () => ({ value: 'Computed by Noxtill', tone: 'green' }) }),
          ],
        },
      ],
    },
    {
      key: 'inventory',
      label: 'Products & Inventory',
      title: 'Products & Inventory',
      icon: 'boxes',
      group: 'Operations',
      description: 'Stock rules and who may approve stock changes. Thresholds are set per product in Products.',
      affects: ['Products', 'Inventory', 'Fast Sale', 'Orders', 'Reports'],
      affectsNote: 'Hiding cost removes the figures from the Products and Inventory screens for people without the permission; reports and exports have their own permissions.',
      help: [
        'Each product has its own low-stock threshold; new products start at the default below.',
        'When cost is hidden, the figures are removed from what those screens receive — not just covered up on the page.',
        'Stock counts and transfers can only be approved by roles holding the matching permission.',
      ],
      actions: [{ label: 'Open Inventory', icon: 'external-link', href: '/inventory', kind: 'link' }, { label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        {
          title: 'Stock rules',
          hint: 'Measured now',
          rows: [
            row({
              key: 'inv-low',
              label: 'Products at or below their threshold',
              description: 'Products whose stock is at or below their own low-stock threshold.',
              link: { label: 'Open Inventory', href: '/inventory' },
              state: async (ctx) => {
                const products = await d.prisma.product.findMany({ where: { businessId: ctx.businessId, active: true, kind: 'product' }, select: { stockQty: true, lowStockThreshold: true } });
                const low = products.filter((p) => p.stockQty > 0 && p.stockQty <= p.lowStockThreshold).length;
                const out = products.filter((p) => p.stockQty <= 0).length;
                return { value: `${low} low · ${out} out of stock`, tone: low + out > 0 ? 'amber' : 'green' };
              },
            }),
            policyRow(d, {
              key: 'inv-default',
              policy: 'catalog.defaultLowStockThreshold',
              kind: 'number',
              label: 'Default threshold for new products',
              description: 'A new product starts with this low-stock threshold when none is entered. Products already created keep theirs; change those per product.',
              requires: CAPABILITIES.BUSINESS_PROFILE_MANAGE,
              unit: 'units',
              format: (n) => `${n} unit${n === 1 ? '' : 's'}`,
              step: 1,
            }),
            row({
              key: 'inv-negative',
              label: 'Negative stock',
              description: 'Whether a sale or order may take stock below zero. Set in Sales & POS.',
              link: { label: 'Open Sales & POS settings', href: '/settings/sales' },
              state: async (ctx) => {
                const b = await d.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { policies: true } });
                const allowed = (b.policies as Record<string, unknown> | null)?.['sales.allowNegativeStock'] === true;
                return { value: allowed ? 'Allowed for sales' : 'Blocked for sales', tone: allowed ? 'amber' : 'green' };
              },
            }),
            row({ key: 'inv-sku', label: 'SKU uniqueness', description: 'Two products cannot share a SKU.', state: () => ({ value: 'Unique per business', tone: 'green' }) }),
            policyRow(d, {
              key: 'inv-cost',
              policy: 'catalog.hideCostFromStaff',
              kind: 'toggle',
              label: 'Hide cost price from people without permission',
              description: 'Removes cost price and stock value from the Products and Inventory screens for anyone who does not hold the view-cost permission.',
              risk: 'High',
              impact: 'Team members without the permission will see no cost or margin figures on those screens.',
              on: { text: 'Hidden without permission', tone: 'green' },
              off: { text: 'Visible to all roles', tone: 'amber' },
            }),
            capabilityRow(d, { key: CAPABILITIES.COST_VIEW, label: 'See product cost', description: 'Who may see cost price and stock value when cost is hidden.', impact: 'Cost prices reveal your margins.' }),
          ],
        },
        {
          title: 'Approvals',
          hint: 'Who may confirm stock changes',
          rows: [
            capabilityRow(d, { key: CAPABILITIES.STOCK_COUNTS_APPLY, label: 'Apply stock counts', description: 'Who may confirm a stock count and adjust quantities.', impact: 'Applying a count changes stock quantities on hand.' }),
            capabilityRow(d, { key: CAPABILITIES.STOCK_TRANSFERS_APPROVE, label: 'Approve stock transfers', description: 'Who may approve, ship and receive stock between branches.', impact: 'Moves stock between branches.' }),
            capabilityRow(d, { key: CAPABILITIES.PURCHASES_MANAGE, label: 'Manage purchase orders', description: 'Who may send, confirm and receive purchase orders.', impact: 'A purchase order is a financial commitment to a supplier.' }),
          ],
        },
        {
          title: 'Reorder assumptions',
          hint: 'Used by reorder suggestions',
          rows: [
            row({ key: 'inv-lead', label: 'Supplier lead time', description: 'Assumed days between ordering and receiving stock.', state: () => ({ value: '14 days' }) }),
            row({ key: 'inv-velocity', label: 'Sales velocity window', description: 'Recent days of sales used to estimate demand.', state: () => ({ value: '30 days' }) }),
          ],
        },
      ],
    },
    {
      key: 'bookings',
      label: 'Bookings',
      title: 'Bookings',
      icon: 'calendar-check',
      group: 'Operations',
      description: 'Reminders, working hours and the conflict rules that keep the calendar honest.',
      affects: ['Bookings', 'Notifications', 'Credit'],
      affectsNote: 'Reminder rules run every 15 minutes and send on the channels each customer can receive.',
      help: [
        'Double-booking prevention covers staff, resources and branches together and cannot be disabled.',
        'Deposits are set per service, not globally.',
        'Notice, advance-booking, cancellation and daily-limit rules apply to customers using your booking page and their booking link. Your own team can still book and change anything.',
      ],
      actions: [{ label: 'Open Bookings', icon: 'external-link', href: '/bookings', kind: 'link' }],
      groups: [
        {
          title: 'Reminders',
          hint: 'Only on channels customers can receive',
          dynamicRows: async (ctx) => {
            const rules = await d.prisma.reminderRule.findMany({ where: { businessId: ctx.businessId }, orderBy: { offsetHours: 'desc' } });
            if (rules.length === 0) {
              return [row({ key: 'rem-default', label: 'Reminder timing', description: 'No custom rules are set, so the default reminders are used.', link: { label: 'Add a rule', href: '/bookings' }, state: () => ({ value: '24 hours and 2 hours before' }) })];
            }
            return rules.map((r): RowDef =>
              row({
                key: `reminder:${r.id}`,
                label: `Reminder ${r.offsetHours} hour${r.offsetHours === 1 ? '' : 's'} before`,
                description: `Sent ${r.offsetHours} hour${r.offsetHours === 1 ? '' : 's'} before an appointment${r.channel ? ` on ${r.channel}` : ''}.`,
                risk: 'Medium',
                requires: CAPABILITIES.BOOKINGS_MANAGE,
                link: { label: 'Edit reminders', href: '/bookings' },
                state: () => ({ value: r.active ? 'On' : 'Off', tone: r.active ? 'green' : 'neutral', control: { type: 'toggle', on: r.active } }),
                write: async (_ctx, v) => {
                  await d.prisma.reminderRule.update({ where: { id: r.id }, data: { active: Boolean(v) } });
                },
              }),
            );
          },
        },
        {
          title: 'Availability',
          hint: 'What customers can book',
          rows: [
            row({
              key: 'book-hours',
              label: 'Working hours',
              description: 'The days and hours this business takes bookings. Edited per branch in Branches.',
              link: { label: 'Edit in Branches', href: '/branches/settings' },
              state: async (ctx) => {
                const b = await d.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { workingHours: true } });
                const wh = (b.workingHours ?? {}) as Record<string, string[][]>;
                const open = Object.keys(DAY_LABELS).filter((k) => (wh[k] ?? []).length > 0);
                return { value: open.length ? open.map((k) => DAY_LABELS[k]).join(' · ') : 'Not set', tone: open.length ? 'neutral' : 'amber' };
              },
            }),
            row({
              key: 'book-deposits',
              label: 'Services requiring a deposit',
              description: 'Deposits are set on each service and enforced when a booking is made.',
              link: { label: 'Open Products', href: '/products' },
              state: async (ctx) => {
                const n = await d.prisma.product.count({ where: { businessId: ctx.businessId, kind: 'service', depositRequired: true, active: true } });
                return { value: plural(n, 'service') };
              },
            }),
            row({
              key: 'book-visible',
              label: 'Services shown on the booking page',
              description: 'Empty means every active service is shown.',
              requires: CAPABILITIES.BOOKINGS_MANAGE,
              state: async (ctx) => {
                const s = await d.prisma.bookingLinkSettings.findUnique({ where: { businessId: ctx.businessId } });
                const n = ((s?.visibleServiceIds ?? []) as unknown as string[]).length;
                return { value: n ? plural(n, 'service') : 'All active services' };
              },
            }),
          ],
        },
        {
          title: 'Conflict safety',
          hint: 'Not disableable',
          rows: [
            row({ key: 'book-double', label: 'Double-booking prevention', description: 'Staff, room and branch conflicts are checked together under a lock.', risk: 'High', impact: 'This cannot be turned off. It is what stops two customers being promised the same slot.', state: () => ({ value: 'Always on', tone: 'green' }) }),
            row({ key: 'book-buffers', label: 'Buffers', description: 'Before and after buffers set on a service block the surrounding slots.', state: () => ({ value: 'Enforced', tone: 'green' }) }),
          ],
        },
        {
          title: 'Customer booking rules',
          hint: 'Enforced on your booking page',
          footer: 'Empty means no rule. Times are measured against the start of the booking.',
          rows: [
            policyRow(d, { key: 'book-min-advance', policy: 'bookings.minAdvanceHours', kind: 'number', label: 'Minimum notice', description: 'How many hours before a booking starts customers can still book it. Slots closer than this are not offered.', requires: CAPABILITIES.BOOKINGS_MANAGE, unit: 'hours', format: (n) => `${n} hour${n === 1 ? '' : 's'}`, emptyLabel: 'No minimum' }),
            policyRow(d, { key: 'book-max-advance', policy: 'bookings.maxAdvanceDays', kind: 'number', label: 'Furthest ahead', description: 'How many days ahead customers can book. Later slots are not offered.', requires: CAPABILITIES.BOOKINGS_MANAGE, unit: 'days', format: (n) => `${n} day${n === 1 ? '' : 's'}`, emptyLabel: 'No limit' }),
            policyRow(d, { key: 'book-cancel-window', policy: 'bookings.cancellationWindowHours', kind: 'number', label: 'Cancellation cut-off', description: 'Customers can cancel from their booking link only until this many hours before it starts.', requires: CAPABILITIES.BOOKINGS_MANAGE, unit: 'hours', format: (n) => `${n} hour${n === 1 ? '' : 's'} before`, emptyLabel: 'Any time' }),
            policyRow(d, { key: 'book-reschedule-window', policy: 'bookings.rescheduleWindowHours', kind: 'number', label: 'Reschedule cut-off', description: 'Customers can move a booking from their booking link only until this many hours before it starts.', requires: CAPABILITIES.BOOKINGS_MANAGE, unit: 'hours', format: (n) => `${n} hour${n === 1 ? '' : 's'} before`, emptyLabel: 'Any time' }),
            policyRow(d, { key: 'book-daily-cap', policy: 'bookings.maxDailyBookings', kind: 'number', label: 'Bookings per day', description: 'The most bookings a day can hold. A full day shows no slots and refuses new bookings from the booking page.', requires: CAPABILITIES.BOOKINGS_MANAGE, unit: 'bookings', format: (n) => `${n} per day`, emptyLabel: 'No limit' }),
          ],
        },
      ],
    },
    {
      key: 'customers',
      label: 'Customers',
      title: 'Customers',
      icon: 'user-round',
      group: 'Operations',
      description: 'Duplicate matching, what staff may do with customer records, and who may export them.',
      affects: ['Customers', 'Fast Sale', 'Bookings', 'Marketing'],
      affectsNote: 'These switches only ever narrow what Staff can do. Owners and managers are never restricted by them.',
      help: [
        'Merging is always a person’s decision — Noxtill only proposes candidates.',
        'Making these switches stricter applies immediately to every staff member.',
        'Customer exports run by Staff are logged with who ran them.',
      ],
      actions: [{ label: 'Reset section', icon: 'rotate-ccw', kind: 'reset' }, { label: 'View history', icon: 'history', kind: 'history' }, { label: 'Open Customers', icon: 'external-link', href: '/customers', kind: 'link' }],
      groups: [
        {
          title: 'Merge and duplicates',
          hint: 'Never merged automatically',
          rows: [
            row({
              key: 'match-on',
              label: 'Duplicate detection',
              description: 'What Noxtill compares to spot likely duplicate customers.',
              risk: 'Medium',
              requires: CAPABILITIES.CUSTOMERS_MANAGE,
              reset: { label: 'Phone or email', value: 'phone_or_email' },
              state: async (ctx) => {
                const s = await d.prisma.customerMergeSettings.findUnique({ where: { businessId: ctx.businessId } });
                const cur = s?.matchOn ?? 'phone_or_email';
                const labels: Record<string, string> = { phone_or_email: 'Phone or email', phone_only: 'Phone only', name_and_phone: 'Name and phone' };
                return { value: labels[cur], control: { type: 'select', current: cur, options: Object.entries(labels).map(([value, label]) => ({ value, label })) } };
              },
              write: async (ctx, v) => {
                const matchOn = String(v) as CustomerMatchOn;
                if (!['phone_or_email', 'phone_only', 'name_and_phone'].includes(matchOn)) throw bad('Choose how duplicates are matched.');
                await d.prisma.customerMergeSettings.upsert({ where: { businessId: ctx.businessId }, create: { businessId: ctx.businessId, matchOn }, update: { matchOn } });
              },
            }),
          ],
        },
        {
          title: 'Staff access',
          hint: 'Enforced server-side',
          rows: [
            privacyToggle('staff-export', 'Staff can export customers', 'Whether a Staff role may export the customer list.', 'staffCanExport', 'Exports take customer contact details out of Noxtill. Every customer export is logged.'),
            privacyToggle('staff-merge', 'Staff can merge customers', 'Whether a Staff role may merge two customer records.', 'staffCanMerge', 'Merging combines two customer histories permanently.'),
            privacyToggle('staff-archive', 'Staff can archive customers', 'Whether a Staff role may archive or block customers.', 'staffCanArchive', 'Archived customers drop out of active lists and campaigns.'),
            privacyToggle('staff-credit-export', 'Credit balance in staff exports', 'Whether customer exports run by Staff include what each customer owes.', 'creditBalanceVisibleToStaff', 'Exposes each customer’s outstanding balance to Staff in exports.'),
          ],
        },
        {
          title: 'Fields and labels',
          hint: 'Managed in Customers',
          rows: [
            row({
              key: 'cust-fields',
              label: 'Custom fields',
              description: 'Business-specific fields you added to customer records.',
              link: { label: 'Open customer settings', href: '/customers/settings' },
              state: async (ctx) => ({ value: plural(await d.prisma.customerCustomField.count({ where: { businessId: ctx.businessId } }), 'field') }),
            }),
            row({
              key: 'cust-tags',
              label: 'Tags',
              description: 'Labels used to segment customers.',
              link: { label: 'Open customer settings', href: '/customers/settings' },
              state: async (ctx) => ({ value: plural(await d.prisma.customerTag.count({ where: { businessId: ctx.businessId } }), 'tag') }),
            }),
            row({ key: 'cust-required', label: 'Required fields', description: 'What must be filled in before a customer is saved.', state: () => ({ value: 'Name and phone' }) }),
          ],
        },
      ],
    },
  ];
}
