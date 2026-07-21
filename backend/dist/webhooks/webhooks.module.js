"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhooksModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const webhooks_controller_1 = require("./webhooks.controller");
const webhook_events_processor_1 = require("./webhook-events.processor");
const whatsapp_module_1 = require("../whatsapp/whatsapp.module");
const webhooks_constants_1 = require("./webhooks.constants");
let WebhooksModule = class WebhooksModule {
};
exports.WebhooksModule = WebhooksModule;
exports.WebhooksModule = WebhooksModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: webhooks_constants_1.WEBHOOK_EVENTS_QUEUE }),
            whatsapp_module_1.WhatsappModule,
        ],
        controllers: [webhooks_controller_1.WebhooksController],
        providers: [webhook_events_processor_1.WebhookEventsProcessor],
    })
], WebhooksModule);
//# sourceMappingURL=webhooks.module.js.map