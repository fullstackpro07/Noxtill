"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var JazzCashGatewayAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JazzCashGatewayAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let JazzCashGatewayAdapter = JazzCashGatewayAdapter_1 = class JazzCashGatewayAdapter {
    config;
    key = 'jazzcash';
    logger = new common_1.Logger(JazzCashGatewayAdapter_1.name);
    merchantId;
    constructor(config) {
        this.config = config;
        this.merchantId = this.config.get('JAZZCASH_MERCHANT_ID');
        if (!this.merchantId) {
            this.logger.warn('JAZZCASH_MERCHANT_ID not configured — JazzCash billing is disabled');
        }
    }
    get isConfigured() {
        return !!this.merchantId;
    }
    createCheckoutSession(params) {
        void params;
        if (!this.merchantId) {
            throw new Error('JazzCash is not configured');
        }
        return Promise.reject(new Error('JazzCash checkout is not yet implemented'));
    }
    refund(providerRef, amount) {
        void providerRef;
        void amount;
        if (!this.merchantId) {
            throw new Error('JazzCash is not configured');
        }
        return Promise.reject(new Error('JazzCash refunds are not yet implemented'));
    }
};
exports.JazzCashGatewayAdapter = JazzCashGatewayAdapter;
exports.JazzCashGatewayAdapter = JazzCashGatewayAdapter = JazzCashGatewayAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], JazzCashGatewayAdapter);
//# sourceMappingURL=jazzcash-gateway.adapter.js.map