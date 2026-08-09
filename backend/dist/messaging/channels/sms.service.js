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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var SmsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let SmsService = SmsService_1 = class SmsService {
    config;
    logger = new common_1.Logger(SmsService_1.name);
    constructor(config) {
        this.config = config;
    }
    async send(params) {
        const accountSid = this.config.get('TWILIO_ACCOUNT_SID');
        const authToken = this.config.get('TWILIO_AUTH_TOKEN');
        const fromNumber = this.config.get('TWILIO_FROM_NUMBER');
        const response = await axios_1.default.post(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, new URLSearchParams({
            To: params.to,
            From: fromNumber ?? '',
            Body: params.text,
        }), { auth: { username: accountSid ?? '', password: authToken ?? '' } });
        this.logger.debug(`SMS sent, provider_ref=${response.data.sid}`);
        return { providerRef: response.data.sid };
    }
};
exports.SmsService = SmsService;
exports.SmsService = SmsService = SmsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SmsService);
//# sourceMappingURL=sms.service.js.map