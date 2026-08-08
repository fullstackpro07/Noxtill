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
exports.KeywordsController = void 0;
const common_1 = require("@nestjs/common");
const keywords_service_1 = require("./keywords.service");
const create_tracked_keyword_dto_1 = require("./dto/create-tracked-keyword.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let KeywordsController = class KeywordsController {
    keywordsService;
    constructor(keywordsService) {
        this.keywordsService = keywordsService;
    }
    list() {
        return this.keywordsService.list();
    }
    create(user, dto) {
        return this.keywordsService.create(user.businessId, dto);
    }
    remove(id) {
        return this.keywordsService.remove(id);
    }
    history(id) {
        return this.keywordsService.history(id);
    }
    triggerCheck(user, id) {
        return this.keywordsService.triggerCheck(user.businessId, id);
    }
};
exports.KeywordsController = KeywordsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], KeywordsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_tracked_keyword_dto_1.CreateTrackedKeywordDto]),
    __metadata("design:returntype", void 0)
], KeywordsController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], KeywordsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/history'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], KeywordsController.prototype, "history", null);
__decorate([
    (0, common_1.Post)(':id/check'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], KeywordsController.prototype, "triggerCheck", null);
exports.KeywordsController = KeywordsController = __decorate([
    (0, common_1.Controller)('keywords'),
    __metadata("design:paramtypes", [keywords_service_1.KeywordsService])
], KeywordsController);
//# sourceMappingURL=keywords.controller.js.map