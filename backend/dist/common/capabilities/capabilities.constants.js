"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_ROLE_CAPABILITIES = exports.ALL_CAPABILITIES = exports.CAPABILITIES = void 0;
const prisma_1 = require("../../../generated/prisma");
exports.CAPABILITIES = {
    BILLING_MANAGE: 'billing.manage',
    CREDIT_WRITE_OFF: 'credit.write_off',
    EXPORTS_GENERATE: 'exports.generate',
    MESSAGING_SEND_TEST: 'messaging.send_test',
    STAFF_MANAGE: 'staff.manage',
    PAYROLL_EXPORT: 'payroll.export',
    ROLES_MANAGE: 'roles.manage',
    CUSTOMERS_ERASE: 'customers.erase',
    INTEGRATIONS_MANAGE: 'integrations.manage',
    AUTOMATIONS_MANAGE: 'automations.manage',
    COUPONS_MANAGE: 'coupons.manage',
    VOUCHERS_MANAGE: 'vouchers.manage',
    RETURNS_APPROVE: 'returns.approve',
    PRICING_MANAGE: 'pricing.manage',
    VIDEO_TESTIMONIALS_MODERATE: 'video_testimonials.moderate',
    STAFF_MANAGE_SCHEDULE: 'staff.manage_schedule',
};
exports.ALL_CAPABILITIES = Object.values(exports.CAPABILITIES);
const OWNER_AND_MANAGER_CAPABILITIES = [
    exports.CAPABILITIES.CUSTOMERS_ERASE,
    exports.CAPABILITIES.INTEGRATIONS_MANAGE,
    exports.CAPABILITIES.AUTOMATIONS_MANAGE,
    exports.CAPABILITIES.COUPONS_MANAGE,
    exports.CAPABILITIES.VOUCHERS_MANAGE,
    exports.CAPABILITIES.RETURNS_APPROVE,
    exports.CAPABILITIES.PRICING_MANAGE,
    exports.CAPABILITIES.VIDEO_TESTIMONIALS_MODERATE,
    exports.CAPABILITIES.STAFF_MANAGE_SCHEDULE,
];
exports.SYSTEM_ROLE_CAPABILITIES = {
    [prisma_1.Role.owner]: exports.ALL_CAPABILITIES,
    [prisma_1.Role.manager]: OWNER_AND_MANAGER_CAPABILITIES,
    [prisma_1.Role.staff]: [],
};
//# sourceMappingURL=capabilities.constants.js.map