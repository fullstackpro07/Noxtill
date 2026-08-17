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
exports.StockTransfersController = void 0;
const common_1 = require("@nestjs/common");
const stock_transfers_service_1 = require("./stock-transfers.service");
const create_stock_transfer_dto_1 = require("./dto/create-stock-transfer.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
const prisma_1 = require("../../generated/prisma");
let StockTransfersController = class StockTransfersController {
    stockTransfers;
    constructor(stockTransfers) {
        this.stockTransfers = stockTransfers;
    }
    create(user, dto) {
        return this.stockTransfers.create(user.businessId, user.sub, dto);
    }
    list(user, status) {
        return this.stockTransfers.list(user.businessId, status);
    }
    findOne(user, id) {
        return this.stockTransfers.findOne(user.businessId, id);
    }
    approve(user, id) {
        return this.stockTransfers.approve(user.businessId, id, user.sub);
    }
    ship(user, id) {
        return this.stockTransfers.ship(user.businessId, id, user.sub);
    }
    receive(user, id) {
        return this.stockTransfers.receive(user.businessId, id, user.sub);
    }
    reject(user, id, dto) {
        return this.stockTransfers.reject(user.businessId, id, user.sub, dto.reason);
    }
};
exports.StockTransfersController = StockTransfersController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_stock_transfer_dto_1.CreateStockTransferDto]),
    __metadata("design:returntype", void 0)
], StockTransfersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StockTransfersController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StockTransfersController.prototype, "findOne", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STOCK_TRANSFERS_APPROVE),
    (0, common_1.Patch)(':id/approve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StockTransfersController.prototype, "approve", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STOCK_TRANSFERS_APPROVE),
    (0, common_1.Patch)(':id/ship'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StockTransfersController.prototype, "ship", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STOCK_TRANSFERS_APPROVE),
    (0, common_1.Patch)(':id/receive'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], StockTransfersController.prototype, "receive", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.STOCK_TRANSFERS_APPROVE),
    (0, common_1.Patch)(':id/reject'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_stock_transfer_dto_1.RejectStockTransferDto]),
    __metadata("design:returntype", void 0)
], StockTransfersController.prototype, "reject", null);
exports.StockTransfersController = StockTransfersController = __decorate([
    (0, common_1.Controller)('stock-transfers'),
    __metadata("design:paramtypes", [stock_transfers_service_1.StockTransfersService])
], StockTransfersController);
//# sourceMappingURL=stock-transfers.controller.js.map