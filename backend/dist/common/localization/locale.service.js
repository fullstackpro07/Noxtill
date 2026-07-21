"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocaleService = void 0;
const common_1 = require("@nestjs/common");
let LocaleService = class LocaleService {
    formatCurrency(amount, business) {
        const value = typeof amount === 'string' ? Number(amount) : amount;
        return new Intl.NumberFormat(business.locale, {
            style: 'currency',
            currency: business.currency,
        }).format(value);
    }
    formatDate(date, business) {
        return new Intl.DateTimeFormat(business.locale, {
            dateStyle: 'medium',
            timeZone: business.timezone,
        }).format(date);
    }
    formatDateTime(date, business) {
        return new Intl.DateTimeFormat(business.locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: business.timezone,
        }).format(date);
    }
    currentLocalTime(timezone, at = new Date()) {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(at);
        const hour = parts.find((p) => p.type === 'hour').value;
        const minute = parts.find((p) => p.type === 'minute').value;
        return `${hour}:${minute}`;
    }
};
exports.LocaleService = LocaleService;
exports.LocaleService = LocaleService = __decorate([
    (0, common_1.Injectable)()
], LocaleService);
//# sourceMappingURL=locale.service.js.map