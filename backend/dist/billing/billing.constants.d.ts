export declare const BILLING_ERROR_CODES: {
    readonly PLAN_NOT_FOUND: "BILLING_PLAN_NOT_FOUND";
    readonly GATEWAY_NOT_CONFIGURED: "BILLING_GATEWAY_NOT_CONFIGURED";
    readonly GATEWAY_NOT_AVAILABLE: "BILLING_GATEWAY_NOT_AVAILABLE";
};
export declare const TRIAL_EXPIRY_QUEUE = "trial-expiry";
export declare const BASIC_PLAN_KEY = "basic";
export declare const DEFAULT_PLANS: readonly [{
    readonly key: "basic";
    readonly name: "Basic";
    readonly price: 0;
    readonly msgQuota: 200;
    readonly userLimit: 2;
}, {
    readonly key: "starter";
    readonly name: "Starter";
    readonly price: 19;
    readonly msgQuota: 1000;
    readonly userLimit: 5;
}, {
    readonly key: "pro";
    readonly name: "Pro";
    readonly price: 49;
    readonly msgQuota: 5000;
    readonly userLimit: 15;
}, {
    readonly key: "premium";
    readonly name: "Premium";
    readonly price: 99;
    readonly msgQuota: 20000;
    readonly userLimit: 50;
}];
