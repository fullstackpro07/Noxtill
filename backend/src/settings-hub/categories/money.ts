import { HttpStatus } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, HubValue, row, RowDef, plural } from '../hub.core';
import { HubDeps, business, monthStart, updateBusiness } from './hub.deps';
import { capabilityRow } from './access';
import { policyRow } from './policy-rows';

const bad = (message: string) => new AppException('SETTING_INVALID', message, HttpStatus.BAD_REQUEST);
const num = (v: HubValue, min: number, max: number, what: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${what} must be a number from ${min} to ${max}.`);
  return n;
};

export function moneyCategories(d: HubDeps): CategoryDef[] {
  return [
    {
      key: 'billing',
      label: 'Billing & Subscription',
      title: 'Billing & Subscription',
      icon: 'receipt',
      group: 'Money',
      description: 'Your Noxtill plan and usage. Kept strictly separate from your customers’ payment data.',
      affects: ['Platform access', 'Messaging quota'],
      affectsNote: 'Your subscription affects your access to Noxtill and message quota, not your customers’ transactions.',
      help: [
        'Noxtill invoices and customer invoices never appear in the same report.',
        'Usage shown here is your platform usage, not your business volume.',
        'A trial that ends without a subscription falls back to the Basic plan.',
      ],
      actions: [{ label: 'Manage plan', icon: 'external-link', primary: true, href: '/settings/tools/billing', kind: 'link' }],
      groups: [
        {
          title: 'Your Noxtill plan',
          hint: 'Separate from customer payments',
          rows: [
            row({
              key: 'plan',
              label: 'Plan',
              description: 'Your current subscription.',
              risk: 'Medium',
              link: { label: 'Manage plan', href: '/settings/tools/billing' },
              state: async (ctx) => {
                const b = await d.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, include: { plan: true } });
                return { value: b.plan ? `${b.plan.name} · $${Number(b.plan.price)}/month` : 'No plan' };
              },
            }),
            row({
              key: 'billing-status',
              label: 'Billing status',
              description: 'Whether the subscription is active, on trial or on the free plan.',
              risk: 'Medium',
              state: async (ctx) => {
                const b = await business(d, ctx);
                if (b.stripeSubscriptionId) return { value: 'Active subscription', tone: 'green' };
                if (b.trialEndsAt && b.trialEndsAt > ctx.now) {
                  const days = Math.ceil((b.trialEndsAt.getTime() - ctx.now.getTime()) / 86_400_000);
                  return { value: `Trial · ${plural(days, 'day')} left`, tone: days <= 3 ? 'amber' : 'blue' };
                }
                return { value: 'No paid subscription', tone: 'neutral' };
              },
            }),
            row({
              key: 'message-usage',
              label: 'Messages this month',
              description: 'Customer messages sent against your plan’s monthly quota.',
              state: async (ctx) => {
                const b = await business(d, ctx);
                const pct = b.msgQuota ? Math.round((b.msgUsed / b.msgQuota) * 100) : 0;
                return { value: `${b.msgUsed.toLocaleString('en-US')} of ${b.msgQuota.toLocaleString('en-US')}`, tone: pct >= 90 ? 'amber' : 'neutral' };
              },
            }),
            row({
              key: 'seats',
              label: 'Team members',
              description: 'Active team members against the plan’s user limit. The limit is shown for reference and is not enforced.',
              state: async (ctx) => {
                const [b, active] = await Promise.all([d.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, include: { plan: true } }), d.prisma.businessUser.count({ where: { businessId: ctx.businessId, active: true } })]);
                return { value: b.plan ? `${active} of ${b.plan.userLimit}` : `${active}` };
              },
            }),
            row({
              key: 'ai-spend',
              label: 'AI spend this month',
              description: 'Estimated AI cost this month against your cap.',
              state: async (ctx) => {
                const [b, sum] = await Promise.all([business(d, ctx), d.prisma.aiCallLog.aggregate({ where: { businessId: ctx.businessId, createdAt: { gte: monthStart(ctx.now) } }, _sum: { estimatedCostUsd: true } })]);
                const used = Number(sum._sum.estimatedCostUsd ?? 0);
                const cap = Number(b.aiMonthlyCostCapUsd);
                return { value: `$${used.toFixed(2)} of $${cap.toFixed(2)}`, tone: cap > 0 && used / cap >= 0.9 ? 'amber' : 'neutral' };
              },
            }),
          ],
          footer: 'A trial that ends without a subscription falls back to the Basic plan and its message quota. Your data export stays available.',
        },
        {
          title: 'Add-ons',
          hint: 'Flags only',
          rows: [
            row({
              key: 'add-ons',
              label: 'Selected add-ons',
              description: 'Add-ons you opted into. They are recorded as flags and do not yet change quota or billing.',
              link: { label: 'Manage add-ons', href: '/settings/tools/billing' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                const list = (b.addOns as unknown as string[]) ?? [];
                return { value: list.length ? list.join(' · ') : 'None', tone: 'neutral' };
              },
            }),
          ],
        },
      ],
    },
    {
      key: 'payments',
      label: 'Payments & Billing',
      title: 'Payments & Billing',
      icon: 'wallet-cards',
      group: 'Money',
      description: 'How your business takes payment and handles refunds, kept separate from your Noxtill subscription.',
      affects: ['Fast Sale', 'Orders', 'Credit', 'Reports'],
      affectsNote: 'These rules describe what happens at the counter and on returns. They do not change payments already recorded.',
      help: [
        'Customer payment data and Noxtill subscription billing are kept strictly apart.',
        'The payment methods list is a stored preference; the counter currently offers every method.',
        'Who may approve a refund is a permission, shown below.',
      ],
      actions: [{ label: 'Open Branches', icon: 'external-link', href: '/branches/settings', kind: 'link' }],
      groups: [
        {
          title: 'Payment methods',
          hint: 'Stored preference',
          rows: [
            row({
              key: 'accepted-methods',
              label: 'Accepted payment methods',
              description: 'The methods this business lists as accepted. Edited from Branches. The counter currently offers every method regardless.',
              link: { label: 'Edit in Branches', href: '/branches/settings' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                const list = (b.acceptedPaymentMethods as unknown as string[]) ?? [];
                return { value: list.length ? list.join(' · ') : 'None listed' };
              },
            }),
          ],
        },
        {
          title: 'Refunds and credit sales',
          hint: 'Some fixed, some set in Sales & POS',
          rows: [
            capabilityRow(d, { key: CAPABILITIES.RETURNS_APPROVE, label: 'Approve returns and refunds', description: 'A return creates a pending request; only a role holding this permission can approve it.', impact: 'Approving a return refunds money and puts stock back.' }),
            row({ key: 'refund-amount', label: 'Refund amount', description: 'The refund is recomputed from the order’s recorded prices — it can never exceed what was sold.', risk: 'High', state: () => ({ value: 'Computed by Noxtill', tone: 'green' }) }),
            row({
              key: 'refund-limit',
              label: 'Refund limit',
              description: 'A maximum refund amount before the owner must approve it. Set in Sales & POS.',
              link: { label: 'Open Sales & POS settings', href: '/settings/sales' },
              state: async (ctx) => {
                const b = await d.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { policies: true } });
                const limit = (b.policies as Record<string, unknown> | null)?.['returns.refundLimit'];
                return typeof limit === 'number' ? { value: limit.toFixed(2), tone: 'green' } : { value: 'No limit set', tone: 'amber' };
              },
            }),
            row({
              key: 'refund-original',
              label: 'Refund to original method',
              description: 'Whether refunds must go back the way they were paid. Set in Sales & POS.',
              link: { label: 'Open Sales & POS settings', href: '/settings/sales' },
              state: async (ctx) => {
                const b = await d.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { policies: true } });
                const on = (b.policies as Record<string, unknown> | null)?.['returns.refundToOriginalMethod'] === true;
                return { value: on ? 'Enforced' : 'Not enforced', tone: on ? 'green' : 'amber' };
              },
            }),
            row({ key: 'credit-customer', label: 'Credit sales', description: 'A sale on credit must be linked to a customer.', state: () => ({ value: 'Customer required', tone: 'green' }) }),
          ],
        },
      ],
    },
    {
      key: 'tax',
      label: 'Tax',
      title: 'Tax',
      icon: 'receipt-text',
      group: 'Money',
      description: 'Tax rates and how tax is added to sales. Noxtill prepares tax reporting — it does not file returns or determine your liability.',
      affects: ['Fast Sale', 'Orders', 'Products', 'Reports', 'Invoices'],
      affectsNote: 'A rate change applies to future sales only. Past sales keep the rate recorded at the time.',
      help: [
        'A sale line with no recorded tax rate is reported separately, never assumed to be zero-rated.',
        'By default tax is added on top of prices: total = subtotal − discount + tax. If prices already include tax (set in Sales & POS), tax is taken out of the price instead and the total does not change.',
        'Noxtill will not tell you whether you are compliant — that is not something it can verify.',
      ],
      notice: { text: 'Noxtill prepares tax reporting from your business data. It does not file returns, submit to any authority, or determine your legal liability.', icon: 'info', action: { label: 'Open Tax Reports', href: '/reports/tax' } },
      actions: [
        { label: 'Reset section', icon: 'rotate-ccw', kind: 'reset' },
        { label: 'View history', icon: 'history', kind: 'history' },
      ],
      groups: [
        {
          title: 'Default tax',
          hint: 'Used when no tax rule matches',
          rows: [
            row({
              key: 'tax-label',
              label: 'Tax name',
              description: 'What the tax is called on receipts, invoices and reports (for example VAT or GST).',
              requires: CAPABILITIES.BUSINESS_PROFILE_MANAGE,
              reset: { label: 'Tax', value: 'Tax' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: b.taxLabel, control: { type: 'text', current: b.taxLabel, maxLength: 30 } };
              },
              write: async (ctx, v) => {
                const label = String(v).trim();
                if (!label) throw bad('Give the tax a name.');
                await updateBusiness(d, ctx, { taxLabel: label.slice(0, 30) });
              },
            }),
            row({
              key: 'tax-mode',
              label: 'How tax is applied',
              description: 'Whether prices already contain tax. Set in Sales & POS.',
              link: { label: 'Open Sales & POS settings', href: '/settings/sales' },
              state: async (ctx) => {
                const b = await d.prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { policies: true } });
                const inclusive = (b.policies as Record<string, unknown> | null)?.['sales.pricesIncludeTax'] === true;
                return { value: inclusive ? 'Included in prices' : 'Added on top of prices', tone: 'blue' };
              },
            }),
            row({
              key: 'tax-rate',
              label: 'Default tax rate',
              description: 'Applied to a sale line when no tax rule matches its category.',
              risk: 'High',
              impact: 'Applies to sales made from now on. Past sales keep the rate recorded at the time and are never recalculated.',
              requires: CAPABILITIES.BUSINESS_PROFILE_MANAGE,
              reset: { label: '0%', value: 0 },
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: `${Number(b.taxRate)}%`, tone: Number(b.taxRate) > 0 ? 'blue' : 'neutral', control: { type: 'number', current: Number(b.taxRate), min: 0, max: 100, step: 0.01, unit: '%' } };
              },
              write: async (ctx, v) => updateBusiness(d, ctx, { taxRate: num(v, 0, 100, 'The tax rate') }),
            }),
            row({
              key: 'tax-pricing',
              label: 'Pricing',
              description: 'Tax is added on top of the listed price. Tax-inclusive pricing is not applied to sales.',
              state: () => ({ value: 'Tax-exclusive' }),
            }),
            row({
              key: 'tax-filing-day',
              label: 'Filing reminder day',
              description: 'The day of the month you file by. Noxtill only reminds you — it does not know or verify any authority’s deadline.',
              requires: 'owner',
              reset: { label: '15th', value: 15 },
              link: { label: 'Open Tax Reports', href: '/reports/tax' },
              state: async (ctx) => {
                const b = await business(d, ctx);
                return { value: `${b.taxFilingDay}${[11, 12, 13].includes(b.taxFilingDay) ? 'th' : ['th', 'st', 'nd', 'rd'][b.taxFilingDay % 10] ?? 'th'} of each month`, control: { type: 'number', current: b.taxFilingDay, min: 1, max: 28, step: 1, unit: 'day' } };
              },
              write: async (ctx, v) => updateBusiness(d, ctx, { taxFilingDay: num(v, 1, 28, 'The filing day') }),
            }),
          ],
        },
        {
          title: 'Tax rates',
          hint: 'A rule matches a product category',
          dynamicRows: async (ctx) => {
            const rules = await d.prisma.taxRule.findMany({ where: { businessId: ctx.businessId }, orderBy: { createdAt: 'asc' } });
            return rules.map((r): RowDef =>
              row({
                key: `taxrule:${r.id}`,
                label: r.label,
                description: r.category ? `Applies to products in the “${r.category}” category.` : 'Catch-all: applies to any product no other active rule matches.',
                risk: 'High',
                impact: 'A changed rate applies to future sales of matching products only. It never recalculates past tax.',
                requires: CAPABILITIES.TAX_RULES_MANAGE,
                link: { label: 'Edit tax rules', href: '/settings/tools/tax' },
                state: () => ({ value: `${Number(r.rate)}% · ${r.active ? 'active' : 'inactive'}`, tone: r.active ? 'blue' : 'neutral', control: { type: 'number', current: Number(r.rate), min: 0, max: 100, step: 0.01, unit: '%' } }),
                write: async (_ctx, v) => {
                  await d.prisma.taxRule.update({ where: { id: r.id }, data: { rate: num(v, 0, 100, 'The tax rate') } });
                },
              }),
            );
          },
          footer: 'To add or remove a rule, use Edit tax rules. Rates you change here apply to future sales only.',
        },
        {
          title: 'Which rules apply',
          hint: 'Inactive rules are ignored',
          dynamicRows: async (ctx) => {
            const rules = await d.prisma.taxRule.findMany({ where: { businessId: ctx.businessId }, orderBy: { createdAt: 'asc' } });
            return rules.map((r): RowDef =>
              row({
                key: `taxrule-active:${r.id}`,
                label: `${r.label} rule`,
                description: 'Whether this rule is used when pricing a sale.',
                risk: 'High',
                impact: 'Turning a rule off makes matching products fall back to another rule or the default rate for future sales.',
                requires: CAPABILITIES.TAX_RULES_MANAGE,
                state: () => ({ value: r.active ? 'On' : 'Off', tone: r.active ? 'green' : 'neutral', control: { type: 'toggle', on: r.active } }),
                write: async (_ctx, v) => {
                  await d.prisma.taxRule.update({ where: { id: r.id }, data: { active: Boolean(v) } });
                },
              }),
            );
          },
        },
        {
          title: 'Validation',
          hint: 'What is missing or unmatched',
          rows: [
            row({
              key: 'tax-unmatched',
              label: 'Products with no matching rule',
              description: 'Products that use the default rate because no active rule matches their category.',
              state: async (ctx) => {
                const [rules, products] = await Promise.all([d.prisma.taxRule.findMany({ where: { businessId: ctx.businessId, active: true } }), d.prisma.product.findMany({ where: { businessId: ctx.businessId, active: true }, select: { category: true } })]);
                if (rules.some((r) => !r.category)) return { value: 'None — a catch-all rule applies', tone: 'green' };
                const cats = new Set(rules.map((r) => r.category));
                const n = products.filter((p) => !p.category || !cats.has(p.category)).length;
                return { value: rules.length === 0 ? `All ${plural(products.length, 'product')} use the default rate` : `${n} of ${plural(products.length, 'product')} use the default rate`, tone: n > 0 && rules.length > 0 ? 'amber' : 'neutral' };
              },
            }),
          ],
        },
      ],
    },
    {
      key: 'credit',
      label: 'Credit',
      title: 'Credit',
      icon: 'credit-card',
      group: 'Money',
      description: 'Reminders and the rules around credit. Outstanding credit is never treated as collected cash anywhere in Noxtill.',
      affects: ['Credit', 'Fast Sale', 'Customers', 'Reports', 'Notifications'],
      affectsNote: 'Reminder rules run daily at 09:00 and only message customers who have not opted out.',
      help: [
        'Write-offs always require the owner and a typed confirmation — there is no setting that removes that.',
        'A credit limit stops a credit sale that would take a customer past it. A customer\u2019s own limit replaces the default one; the owner and anyone holding the override permission can go past it.',
        'AI cannot change a balance or write anything off.',
      ],
      actions: [{ label: 'Open Credit', icon: 'external-link', href: '/credit', kind: 'link' }, { label: 'View history', icon: 'history', kind: 'history' }],
      groups: [
        {
          title: 'Reminder rules',
          hint: 'Sent daily at 09:00',
          dynamicRows: async (ctx) => {
            const rules = await d.prisma.creditReminderRule.findMany({ where: { businessId: ctx.businessId }, orderBy: { daysOverdueTrigger: 'asc' } });
            if (rules.length === 0) {
              return [row({ key: 'credit-no-rules', label: 'Reminder rules', description: 'No reminder rules are set, so no credit reminders are sent automatically.', link: { label: 'Add a rule', href: '/credit' }, state: () => ({ value: 'None', tone: 'amber' }) })];
            }
            return rules.map((r): RowDef =>
              row({
                key: `credit-rule:${r.id}`,
                label: `${r.tone[0].toUpperCase()}${r.tone.slice(1)} reminder · ${r.daysOverdueTrigger} days overdue`,
                description: `Sent when a balance is ${r.daysOverdueTrigger} or more days outstanding${r.channel ? ` on ${r.channel}` : ' on the customer’s best channel'}.`,
                risk: 'Medium',
                requires: CAPABILITIES.CREDIT_MANAGE,
                link: { label: 'Edit rules', href: '/credit' },
                state: () => ({ value: r.active ? 'On' : 'Off', tone: r.active ? 'green' : 'neutral', control: { type: 'toggle', on: r.active } }),
                write: async (_ctx, v) => {
                  await d.prisma.creditReminderRule.update({ where: { id: r.id }, data: { active: Boolean(v) } });
                },
              }),
            );
          },
        },
        {
          title: 'Fixed rules',
          hint: 'Enforced, not configurable',
          rows: [
            capabilityRow(d, { key: CAPABILITIES.CREDIT_WRITE_OFF, label: 'Write off a balance', description: 'Removing a balance you no longer expect to collect. It also always requires typing the confirmation phrase.', impact: 'A write-off changes recorded revenue and is recorded with who approved it.' }),
            row({ key: 'credit-buckets', label: 'Aging buckets', description: 'How outstanding balances are grouped in reports.', state: () => ({ value: '0–29 · 30–59 · 60–89 · 90+ days' }) }),
            row({ key: 'credit-atrisk', label: 'At-risk balance', description: 'When a balance is treated as at risk.', state: () => ({ value: '90+ days and no installment plan' }) }),
            row({ key: 'credit-optout', label: 'Opted-out customers', description: 'Reminders skip customers who opted out.', risk: 'High', state: () => ({ value: 'Always skipped', tone: 'green' }) }),
          ],
        },
        {
          title: 'Credit limit',
          hint: 'Enforced on credit sales',
          footer: 'The limit counts what the customer already owes plus the new credit sale. A limit set on a customer\u2019s own profile replaces the default.',
          rows: [
            policyRow(d, {
              key: 'credit-limit',
              policy: 'credit.defaultLimit',
              kind: 'number',
              label: 'Default credit limit',
              description: 'The most a customer may owe on credit, for customers with no limit of their own. Empty means no limit.',
              risk: 'High',
              impact: 'A credit sale that would take a customer over the limit is refused unless the person selling holds the override permission.',
              format: (n) => n.toFixed(2),
              emptyLabel: 'No limit',
              step: 1,
              tone: (n) => (n === null ? 'amber' : 'green'),
            }),
            capabilityRow(d, { key: CAPABILITIES.CREDIT_LIMIT_OVERRIDE, label: 'Go past a credit limit', description: 'Who may sell on credit beyond a customer\u2019s limit.', impact: 'Lets a person extend more credit than the limit allows.' }),
            row({
              key: 'credit-customer-limits',
              label: 'Customers with their own limit',
              description: 'Limits set on individual customer profiles.',
              link: { label: 'Open Customers', href: '/customers' },
              state: async (ctx) => {
                const n = await d.prisma.customer.count({ where: { businessId: ctx.businessId, creditLimit: { not: null } } });
                return { value: n === 0 ? 'None set' : plural(n, 'customer') };
              },
            }),
          ],
        },
      ],
    },
  ];
}

void Role;
