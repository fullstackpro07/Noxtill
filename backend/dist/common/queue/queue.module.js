"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const queue_constants_1 = require("./queue.constants");
const queue_service_1 = require("./queue.service");
const demo_processor_1 = require("./demo.processor");
const dead_letter_listener_1 = require("./dead-letter.listener");
let QueueModule = class QueueModule {
};
exports.QueueModule = QueueModule;
exports.QueueModule = QueueModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    connection: {
                        host: config.get('REDIS_HOST', 'localhost'),
                        port: Number(config.get('REDIS_PORT', 6379)),
                    },
                }),
            }),
            bullmq_1.BullModule.registerQueue({ name: queue_constants_1.DEMO_QUEUE }, { name: (0, queue_constants_1.dlqName)(queue_constants_1.DEMO_QUEUE) }),
        ],
        providers: [queue_service_1.QueueService, demo_processor_1.DemoProcessor, dead_letter_listener_1.DeadLetterListener],
        exports: [queue_service_1.QueueService, bullmq_1.BullModule],
    })
], QueueModule);
//# sourceMappingURL=queue.module.js.map