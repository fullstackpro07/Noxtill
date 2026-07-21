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
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const inventory_service_1 = require("./inventory.service");
const create_purchase_dto_1 = require("./dto/create-purchase.dto");
const create_wastage_dto_1 = require("./dto/create-wastage.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let InventoryController = class InventoryController {
    inventoryService;
    constructor(inventoryService) {
        this.inventoryService = inventoryService;
    }
    recordPurchase(user, dto) {
        return this.inventoryService.recordPurchase(user.businessId, dto);
    }
    recordWastage(user, dto) {
        return this.inventoryService.recordWastage(user.businessId, dto);
    }
    listInventory() {
        return this.inventoryService.listInventory();
    }
    getMovements(productId) {
        return this.inventoryService.getMovements(productId);
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Post)('inventory/purchases'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_purchase_dto_1.CreatePurchaseDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "recordPurchase", null);
__decorate([
    (0, common_1.Post)('inventory/wastage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_wastage_dto_1.CreateWastageDto]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "recordWastage", null);
__decorate([
    (0, common_1.Get)('inventory'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listInventory", null);
__decorate([
    (0, common_1.Get)('inventory/:product/movements'),
    __param(0, (0, common_1.Param)('product')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "getMovements", null);
exports.InventoryController = InventoryController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map