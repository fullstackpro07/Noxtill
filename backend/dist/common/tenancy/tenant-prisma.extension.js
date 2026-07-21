"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantScopingExtension = tenantScopingExtension;
const prisma_1 = require("../../../generated/prisma");
const tenant_constants_1 = require("./tenant.constants");
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
function withBusinessId(value, businessId) {
    return { ...value, businessId };
}
function tenantScopingExtension(cls) {
    return prisma_1.Prisma.defineExtension({
        name: 'tenant-scoping',
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    if (!model || !tenant_constants_1.TENANT_SCOPED_MODELS.has(model)) {
                        return query(args);
                    }
                    const businessId = cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
                    if (!businessId) {
                        return query(args);
                    }
                    const scopedArgs = args;
                    if (WRITE_OPS_SINGLE.has(operation)) {
                        scopedArgs.data = withBusinessId(scopedArgs.data, businessId);
                    }
                    else if (WRITE_OPS_MANY.has(operation)) {
                        const data = scopedArgs.data;
                        scopedArgs.data = Array.isArray(data)
                            ? data.map((row) => withBusinessId(row, businessId))
                            : withBusinessId(data, businessId);
                    }
                    else if (operation === 'upsert') {
                        scopedArgs.where = withBusinessId(scopedArgs.where, businessId);
                        scopedArgs.create = withBusinessId(scopedArgs.create, businessId);
                    }
                    else if (WHERE_OPS.has(operation)) {
                        scopedArgs.where = withBusinessId(scopedArgs.where, businessId);
                    }
                    return query(scopedArgs);
                },
            },
        },
    });
}
//# sourceMappingURL=tenant-prisma.extension.js.map