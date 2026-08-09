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
var EmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
function humanize(templateKey) {
    return templateKey
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
let EmailService = EmailService_1 = class EmailService {
    config;
    logger = new common_1.Logger(EmailService_1.name);
    constructor(config) {
        this.config = config;
    }
    async send(params) {
        const serverToken = this.config.get('EMAIL_PROVIDER_KEY');
        const fromAddress = this.config.get('EMAIL_FROM_ADDRESS');
        const response = await axios_1.default.post('https://api.postmarkapp.com/email', {
            From: fromAddress,
            To: params.to,
            Subject: humanize(params.templateKey),
            TextBody: params.text,
        }, {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Postmark-Server-Token': serverToken,
            },
        });
        this.logger.debug(`Email sent, provider_ref=${response.data.MessageID}`);
        return { providerRef: response.data.MessageID };
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailService);
//# sourceMappingURL=email.service.js.map