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
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const orders_service_1 = require("./orders.service");
const invoice_service_1 = require("./invoice.service");
const create_sale_dto_1 = require("./dto/create-sale.dto");
const hold_sale_dto_1 = require("./dto/hold-sale.dto");
const resume_held_sale_dto_1 = require("./dto/resume-held-sale.dto");
const split_bill_dto_1 = require("./dto/split-bill.dto");
const update_order_status_dto_1 = require("./dto/update-order-status.dto");
const generate_invoice_dto_1 = require("./dto/generate-invoice.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const prisma_1 = require("../../generated/prisma");
let OrdersController = class OrdersController {
    ordersService;
    invoiceService;
    constructor(ordersService, invoiceService) {
        this.ordersService = ordersService;
        this.invoiceService = invoiceService;
    }
    createSale(user, dto) {
        return this.ordersService.createSale(user.businessId, dto);
    }
    findAll(status) {
        return this.ordersService.findAll(status);
    }
    findOne(id) {
        return this.ordersService.findOne(id);
    }
    createDraft(user, dto) {
        return this.ordersService.createDraft(user.businessId, dto);
    }
    convertDraft(user, id, dto) {
        return this.ordersService.convertDraft(user.businessId, id, dto);
    }
    updateStatus(user, id, dto) {
        return this.ordersService.updateStatus(user.businessId, id, dto.status);
    }
    splitBill(id, dto) {
        return this.ordersService.splitBill(id, dto.parts);
    }
    generateInvoice(user, id, dto) {
        return this.invoiceService.generate(user.businessId, id, dto.send);
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Post)('sales'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_sale_dto_1.CreateSaleDto]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "createSale", null);
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('orders/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)('orders/draft'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, hold_sale_dto_1.HoldSaleDto]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "createDraft", null);
__decorate([
    (0, common_1.Post)('orders/:id/convert'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, resume_held_sale_dto_1.ResumeHeldSaleDto]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "convertDraft", null);
__decorate([
    (0, common_1.Patch)('orders/:id/status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_order_status_dto_1.UpdateOrderStatusDto]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)('orders/:id/split-bill'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, split_bill_dto_1.SplitBillDto]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "splitBill", null);
__decorate([
    (0, common_1.Post)('orders/:id/invoice'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, generate_invoice_dto_1.GenerateInvoiceDto]),
    __metadata("design:returntype", void 0)
], OrdersController.prototype, "generateInvoice", null);
exports.OrdersController = OrdersController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [orders_service_1.OrdersService,
        invoice_service_1.InvoiceService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map