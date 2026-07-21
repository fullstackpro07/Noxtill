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
var WhatsappService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const whatsapp_window_service_1 = require("./whatsapp-window.service");
let WhatsappService = WhatsappService_1 = class WhatsappService {
    config;
    window;
    logger = new common_1.Logger(WhatsappService_1.name);
    constructor(config, window) {
        this.config = config;
        this.window = window;
    }
    async send(params) {
        const withinWindow = params.customerId
            ? await this.window.isOpen(params.businessId, params.customerId)
            : false;
        const body = withinWindow
            ? {
                messaging_product: 'whatsapp',
                to: params.to,
                type: 'text',
                text: { body: params.text },
            }
            : {
                messaging_product: 'whatsapp',
                to: params.to,
                type: 'template',
                template: {
                    name: params.templateKey,
                    language: { code: params.locale },
                },
            };
        const phoneId = this.config.get('META_WA_PHONE_ID');
        const token = this.config.get('META_WA_TOKEN');
        const apiVersion = this.config.get('META_WA_API_VERSION', 'v19.0');
        const response = await axios_1.default.post(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, body, { headers: { Authorization: `Bearer ${token}` } });
        const providerRef = response.data.messages[0]?.id;
        this.logger.debug(`WhatsApp message sent to ${params.to}, provider_ref=${providerRef}`);
        return { providerRef };
    }
};
exports.WhatsappService = WhatsappService;
exports.WhatsappService = WhatsappService = WhatsappService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        whatsapp_window_service_1.WhatsappWindowService])
], WhatsappService);
//# sourceMappingURL=whatsapp.service.js.map