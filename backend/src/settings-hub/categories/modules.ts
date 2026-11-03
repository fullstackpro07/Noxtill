import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/filters/app.exception';
import {
  BUSINESS_MODULES,
  type BusinessModuleGroup,
} from '../../business-modules/business-modules.constants';
import { BusinessModulesService } from '../../business-modules/business-modules.service';
import { CategoryDef, plural, row, RowDef } from '../hub.core';
import { HubDeps } from './hub.deps';

const GROUPS: { group: BusinessModuleGroup; hint: string }[] = [
  { group: 'Core', hint: 'Day-to-day operations' },
  {
    group: 'Growth & channels',
    hint: 'Selling and marketing beyond the counter',
  },
  { group: 'AI', hint: 'AI tools' },
];

export function modulesCategories(d: HubDeps): CategoryDef[] {
  const service = new BusinessModulesService(d.prisma);

  const moduleRow = (key: string, label: string, description: string): RowDef =>
    row({
      key: `module-${key}`,
      label,
      description,
      requires: 'owner',
      impact:
        'Turning a module off hides its pages and blocks its own features for everyone in the business, including every branch. Shared records it uses (products, customers, orders, stock, staff, credit) stay available to other modules, and nothing is deleted.',
      reset: { label: 'On', value: true },
      state: async (ctx) => {
        const on = !(await service.disabledFor(ctx.businessId)).includes(key);
        return {
          value: on ? 'On' : 'Off',
          tone: on ? 'green' : 'neutral',
          control: { type: 'toggle', on },
        };
      },
      write: async (ctx, v) => {
        if (typeof v !== 'boolean') {
          throw new AppException(
            'SETTING_INVALID',
            'Choose on or off.',
            HttpStatus.BAD_REQUEST,
          );
        }
        await service.setEnabled(ctx.businessId, key, v);
      },
    });

  return [
    {
      key: 'modules',
      label: 'Modules',
      title: 'Modules',
      icon: 'boxes',
      group: 'Platform',
      description:
        'Choose the Noxtill modules your business uses. Turned-off modules disappear from the sidebar and dashboard, and their own features stop accepting requests.',
      affects: ['Sidebar', 'Every branch', 'Every team member'],
      affectsNote:
        'The choice is shared by the whole business — every branch and every team member sees the same modules.',
      help: [
        'Turning a module off hides its pages and blocks its own features; it never deletes data.',
        'Shared business records stay available — for example, Fast Sale still lists products and records sales and credit when Products, Orders or Credit is off.',
        'Dashboard and Settings are always on, so you can always turn a module back on here.',
      ],
      actions: [{ label: 'View history', icon: 'history', kind: 'history' }],
      groups: GROUPS.map(({ group, hint }) => {
        const modules = BUSINESS_MODULES.filter((m) => m.group === group);
        return {
          title: group,
          hint,
          badge: async (ctx) => {
            const disabled = new Set(await service.disabledFor(ctx.businessId));
            const on = modules.filter((m) => !disabled.has(m.key)).length;
            return {
              text: `${on} of ${plural(modules.length, 'module')} on`,
              tone: on === modules.length ? 'green' : 'blue',
            };
          },
          rows: modules.map((m) => moduleRow(m.key, m.label, m.description)),
        };
      }),
    },
  ];
}
