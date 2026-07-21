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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesController = void 0;
const common_1 = require("@nestjs/common");
const send_gate_service_1 = require("./send-gate.service");
const messages_service_1 = require("./messages.service");
const test_message_dto_1 = require("./dto/test-message.dto");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const prisma_1 = require("../../generated/prisma");
let MessagesController = class MessagesController {
    sendGate;
    messagesService;
    constructor(sendGate, messagesService) {
        this.sendGate = sendGate;
        this.messagesService = messagesService;
    }
    test(user, dto) {
        return this.sendGate.send({
            businessId: user.businessId,
            customerId: dto.customerId,
            to: dto.customerId ? undefined : { phone: dto.phone, email: dto.email },
            templateKey: dto.templateKey,
            variables: dto.variables ?? {},
        });
    }
    list(customerId) {
        return this.messagesService.listByCustomer(customerId);
    }
};
exports.MessagesController = MessagesController;
__decorate([
    (0, roles_decorator_1.Roles)(prisma_1.Role.owner),
    (0, common_1.Post)('test'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, test_message_dto_1.TestMessageDto]),
    __metadata("design:returntype", void 0)
], MessagesController.prototype, "test", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('customer_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], MessagesController.prototype, "list", null);
exports.MessagesController = MessagesController = __decorate([
    (0, common_1.Controller)('messages'),
    __metadata("design:paramtypes", [send_gate_service_1.SendGateService,
        messages_service_1.MessagesService])
], MessagesController);
//# sourceMappingURL=messages.controller.js.map