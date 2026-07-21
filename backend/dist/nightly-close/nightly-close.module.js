"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NightlyCloseModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const nightly_close_service_1 = require("./nightly-close.service");
const nightly_close_scheduler_1 = require("./nightly-close.scheduler");
const nightly_close_processor_1 = require("./nightly-close.processor");
const nightly_close_controller_1 = require("./nightly-close.controller");
const messaging_module_1 = require("../messaging/messaging.module");
const nightly_close_constants_1 = require("./nightly-close.constants");
let NightlyCloseModule = class NightlyCloseModule {
};
exports.NightlyCloseModule = NightlyCloseModule;
exports.NightlyCloseModule = NightlyCloseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: nightly_close_constants_1.NIGHTLY_CLOSE_QUEUE }),
            messaging_module_1.MessagingModule,
        ],
        controllers: [nightly_close_controller_1.NightlyCloseController],
        providers: [
            nightly_close_service_1.NightlyCloseService,
            nightly_close_scheduler_1.NightlyCloseScheduler,
            nightly_close_processor_1.NightlyCloseProcessor,
        ],
    })
], NightlyCloseModule);
//# sourceMappingURL=nightly-close.module.js.map