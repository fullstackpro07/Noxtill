"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagingModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const send_gate_service_1 = require("./send-gate.service");
const template_registry_service_1 = require("./templates/template-registry.service");
const sms_service_1 = require("./channels/sms.service");
const email_service_1 = require("./channels/email.service");
const message_worker_processor_1 = require("./message-worker.processor");
const message_dead_letter_listener_1 = require("./message-dead-letter.listener");
const messages_service_1 = require("./messages.service");
const messages_controller_1 = require("./messages.controller");
const whatsapp_module_1 = require("../whatsapp/whatsapp.module");
const messaging_constants_1 = require("./messaging.constants");
const queue_constants_1 = require("../common/queue/queue.constants");
let MessagingModule = class MessagingModule {
};
exports.MessagingModule = MessagingModule;
exports.MessagingModule = MessagingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: messaging_constants_1.MESSAGES_QUEUE }, { name: (0, queue_constants_1.dlqName)(messaging_constants_1.MESSAGES_QUEUE) }),
            whatsapp_module_1.WhatsappModule,
        ],
        controllers: [messages_controller_1.MessagesController],
        providers: [
            send_gate_service_1.SendGateService,
            template_registry_service_1.TemplateRegistryService,
            sms_service_1.SmsService,
            email_service_1.EmailService,
            message_worker_processor_1.MessageWorkerProcessor,
            message_dead_letter_listener_1.MessageDeadLetterListener,
            messages_service_1.MessagesService,
        ],
        exports: [send_gate_service_1.SendGateService, template_registry_service_1.TemplateRegistryService],
    })
], MessagingModule);
//# sourceMappingURL=messaging.module.js.map