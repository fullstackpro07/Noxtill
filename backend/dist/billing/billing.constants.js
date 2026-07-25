"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PLANS = exports.BASIC_PLAN_KEY = exports.TRIAL_EXPIRY_QUEUE = exports.BILLING_ERROR_CODES = void 0;
exports.BILLING_ERROR_CODES = {
    PLAN_NOT_FOUND: 'BILLING_PLAN_NOT_FOUND',
    GATEWAY_NOT_CONFIGURED: 'BILLING_GATEWAY_NOT_CONFIGURED',
    GATEWAY_NOT_AVAILABLE: 'BILLING_GATEWAY_NOT_AVAILABLE',
};
exports.TRIAL_EXPIRY_QUEUE = 'trial-expiry';
exports.BASIC_PLAN_KEY = 'basic';
exports.DEFAULT_PLANS = [
    { key: 'basic', name: 'Basic', price: 0, msgQuota: 200, userLimit: 2 },
    { key: 'starter', name: 'Starter', price: 19, msgQuota: 1000, userLimit: 5 },
    { key: 'pro', name: 'Pro', price: 49, msgQuota: 5000, userLimit: 15 },
    {
        key: 'premium',
        name: 'Premium',
        price: 99,
        msgQuota: 20000,
        userLimit: 50,
    },
];
//# sourceMappingURL=billing.constants.js.map