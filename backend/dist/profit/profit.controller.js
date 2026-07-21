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
exports.ProfitController = void 0;
const common_1 = require("@nestjs/common");
const profit_service_1 = require("./profit.service");
const query_profit_products_dto_1 = require("./dto/query-profit-products.dto");
const query_pnl_dto_1 = require("./dto/query-pnl.dto");
let ProfitController = class ProfitController {
    profitService;
    constructor(profitService) {
        this.profitService = profitService;
    }
    byProduct(query) {
        return this.profitService.byProduct(query.window ?? 30);
    }
    byTime() {
        return this.profitService.byTime();
    }
    pnl(query) {
        return this.profitService.pnl(query.month);
    }
};
exports.ProfitController = ProfitController;
__decorate([
    (0, common_1.Get)('products'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_profit_products_dto_1.QueryProfitProductsDto]),
    __metadata("design:returntype", void 0)
], ProfitController.prototype, "byProduct", null);
__decorate([
    (0, common_1.Get)('time'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProfitController.prototype, "byTime", null);
__decorate([
    (0, common_1.Get)('pnl'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_pnl_dto_1.QueryPnlDto]),
    __metadata("design:returntype", void 0)
], ProfitController.prototype, "pnl", null);
exports.ProfitController = ProfitController = __decorate([
    (0, common_1.Controller)('profit'),
    __metadata("design:paramtypes", [profit_service_1.ProfitService])
], ProfitController);
//# sourceMappingURL=profit.controller.js.map