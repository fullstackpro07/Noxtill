import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { CategoryDef, plural, row } from '../hub.core';
import { HubDeps } from './hub.deps';
import { policyRow } from './policy-rows';

const PURCHASES = CAPABILITIES.PURCHASES_MANAGE;

/**
 * Settings → Procurement (module 38.8). The one editable rule is a real `Business.policies` key
 * consumed by the supplier-contract renewal alerts; every other row states fixed behaviour or a
 * reference to the module that owns it, and says plainly what this workspace does not have.
 */
export function procurementCategories(d: HubDeps): CategoryDef[] {
  return [
    {
      key: 'procurement',
      label: 'Procurement',
      title: 'Procurement Settings',
      icon: 'boxes',
      group: 'Operations',
      description:
        'Purchase-request, approval and supplier-contract rules for Procurement.',
      affects: ['Purchase Requests', 'Supplier Contracts', 'Action Center'],
      affectsNote:
        'Suppliers stay in Products → Suppliers, purchase orders in Inventory → Purchases and approvals in the Action Center. These settings never copy those records.',
      help: [
        'Submitted purchase requests are approved or rejected from the Action Center.',
        'Contract renewal alerts go to the contract owner (or every business owner when no owner is set) as in-app notifications.',
        'Budgets, vendor bills and 3-way match tolerances need a Finance & Accounting module, which this workspace does not have.',
      ],
      actions: [
        {
          label: 'Open Procurement',
          icon: 'external-link',
          href: '/procurement',
          kind: 'link',
        },
        {
          label: 'Open Action Center',
          icon: 'external-link',
          href: '/dashboard/actions',
          kind: 'link',
        },
        { label: 'Reset section', icon: 'rotate-ccw', kind: 'reset' },
        { label: 'View history', icon: 'history', kind: 'history' },
      ],
      groups: [
        {
          title: 'Purchase requests',
          hint: 'Fixed rules',
          rows: [
            row({
              key: 'procurement-reason',
              label: 'Business reason',
              description:
                'Every purchase request must state a business reason before it can be saved.',
              state: () => ({ value: 'Always required', tone: 'green' }),
            }),
            row({
              key: 'procurement-approval',
              label: 'Approval workflow',
              description:
                'Submitted requests become Action Center items; a manager or owner approves or rejects them there. Nothing is ordered until a request is converted to a purchase order.',
              link: { label: 'Open Action Center', href: '/dashboard/actions' },
              state: () => ({ value: 'Action Center approval', tone: 'green' }),
            }),
            row({
              key: 'procurement-numbering',
              label: 'Request and PO numbering',
              description:
                'Purchase requests and purchase orders are identified by their record id. A configurable number sequence or prefix is not available.',
              state: () => ({ value: 'Not available', tone: 'neutral' }),
            }),
          ],
        },
        {
          title: 'Categories and cost centres',
          hint: 'References',
          dynamicRows: async (ctx) => {
            const [categories, costCentres] = await Promise.all([
              d.prisma.category.count({
                where: { businessId: ctx.businessId },
              }),
              d.prisma.procurementRequest.findMany({
                where: {
                  businessId: ctx.businessId,
                  costCenter: { not: null },
                },
                select: { costCenter: true },
                distinct: ['costCenter'],
              }),
            ]);
            return [
              row({
                key: 'procurement-categories',
                label: 'Purchase categories',
                description:
                  'Request lines use your product categories (or free text for services and expenses). Categories are managed in Products.',
                link: {
                  label: 'Open categories',
                  href: '/products/categories',
                },
                state: () => ({
                  value: plural(categories, 'category', 'categories'),
                  tone: categories ? 'green' : 'amber',
                }),
              }),
              row({
                key: 'procurement-cost-centres',
                label: 'Cost centres',
                description:
                  'Typed on each request. There is no cost-centre master list to manage; these are the values used so far.',
                state: () => ({
                  value: costCentres.length
                    ? costCentres
                        .map((c) => c.costCenter)
                        .slice(0, 6)
                        .join(', ')
                    : 'None used yet',
                  tone: 'neutral',
                }),
              }),
            ];
          },
        },
        {
          title: 'Supplier contracts',
          hint: 'Renewal alerts',
          rows: [
            policyRow(d, {
              key: 'procurement-renewal-alert',
              policy: 'procurement.contractRenewalAlertDays',
              kind: 'number',
              label: 'Alert before the notice deadline',
              description:
                'A contract is marked renewal due, and its owner is notified once, this many days before its notice deadline (expiry date minus the contract’s notice period).',
              requires: PURCHASES,
              unit: 'days',
              format: (n) => `${n} day${n === 1 ? '' : 's'} before`,
            }),
            row({
              key: 'procurement-terms-confirmation',
              label: 'Terms confirmation',
              description:
                'Changed contract terms must be confirmed against the linked source document again; unconfirmed terms show as a compliance issue.',
              state: () => ({ value: 'Always required', tone: 'green' }),
            }),
          ],
        },
        {
          title: 'Finance-dependent controls',
          hint: 'Not in this workspace',
          rows: [
            row({
              key: 'procurement-budgets',
              label: 'Budgets',
              description:
                'Budget availability is read from Finance & Accounting, which this workspace does not have, so budget figures are not available.',
              state: () => ({ value: 'Not available', tone: 'neutral' }),
            }),
            row({
              key: 'procurement-tolerances',
              label: '3-way match tolerances',
              description:
                'Price and quantity tolerances apply to vendor bills, which are not recorded without Finance & Accounting.',
              state: () => ({ value: 'Not available', tone: 'neutral' }),
            }),
          ],
        },
      ],
    },
  ];
}
