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
exports.NightlyCloseController = void 0;
const common_1 = require("@nestjs/common");
const nightly_close_service_1 = require("./nightly-close.service");
const update_nightly_close_dto_1 = require("./dto/update-nightly-close.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let NightlyCloseController = class NightlyCloseController {
    nightlyClose;
    constructor(nightlyClose) {
        this.nightlyClose = nightlyClose;
    }
    async getDay(user, date) {
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) {
            throw new common_1.BadRequestException('Invalid date, expected YYYY-MM-DD');
        }
        return this.nightlyClose.composeDayData(user.businessId, parsed);
    }
    updateSettings(user, dto) {
        return this.nightlyClose.updateSettings(user.businessId, dto.time, dto.channel);
    }
};
exports.NightlyCloseController = NightlyCloseController;
__decorate([
    (0, common_1.Get)('day/:date'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NightlyCloseController.prototype, "getDay", null);
__decorate([
    (0, common_1.Patch)('settings/nightly-close'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_nightly_close_dto_1.UpdateNightlyCloseDto]),
    __metadata("design:returntype", void 0)
], NightlyCloseController.prototype, "updateSettings", null);
exports.NightlyCloseController = NightlyCloseController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [nightly_close_service_1.NightlyCloseService])
], NightlyCloseController);
//# sourceMappingURL=nightly-close.controller.js.map