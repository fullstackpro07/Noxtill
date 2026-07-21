import { Prisma } from '../../../generated/prisma';
import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID, TENANT_SCOPED_MODELS } from './tenant.constants';

type Scoped = Record<string, unknown>;

const WRITE_OPS_SINGLE = new Set(['create']);
const WRITE_OPS_MANY = new Set(['createMany', 'createManyAndReturn']);
const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

function withBusinessId(value: unknown, businessId: string): Scoped {
  return { ...(value as Scoped | undefined), businessId };
}

/**
 * Forces businessId onto every query Prisma sends for a tenant-scoped model,
 * reading it from the current request's CLS context. Callers never pass
 * business_id manually — see BE-006. If no tenant is bound to the current
 * async context (e.g. platform-admin scripts, seed jobs), the query is left
 * untouched so those call sites must scope explicitly.
 *
 * Note: nested relation writes (e.g. `business.create({ data: { customers: { create: [...] } } })`)
 * are NOT rewritten by this extension — only top-level operations on tenant
 * models. Application code should create tenant rows directly against their
 * own model delegate so this extension applies.
 */
export function tenantScopingExtension(cls: ClsService) {
  return Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const businessId = cls.get<string>(CLS_KEY_BUSINESS_ID);
          if (!businessId) {
            return query(args);
          }

          // `args`'s real type is a 500+-member union across every model's operation args, with no
          // structural overlap with Scoped for a direct assertion — tsc requires the unknown bridge.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          const scopedArgs = args as unknown as Scoped;

          if (WRITE_OPS_SINGLE.has(operation)) {
            scopedArgs.data = withBusinessId(scopedArgs.data, businessId);
          } else if (WRITE_OPS_MANY.has(operation)) {
            const data = scopedArgs.data;
            scopedArgs.data = Array.isArray(data)
              ? data.map((row: unknown) => withBusinessId(row, businessId))
              : withBusinessId(data, businessId);
          } else if (operation === 'upsert') {
            scopedArgs.where = withBusinessId(scopedArgs.where, businessId);
            scopedArgs.create = withBusinessId(scopedArgs.create, businessId);
          } else if (WHERE_OPS.has(operation)) {
            scopedArgs.where = withBusinessId(scopedArgs.where, businessId);
          }

          return query(scopedArgs);
        },
      },
    },
  });
}
