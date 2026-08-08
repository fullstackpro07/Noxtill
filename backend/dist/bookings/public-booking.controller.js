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
exports.PublicBookingController = void 0;
const common_1 = require("@nestjs/common");
const public_booking_service_1 = require("./public-booking.service");
const query_slots_dto_1 = require("./dto/query-slots.dto");
const create_public_booking_dto_1 = require("./dto/create-public-booking.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
let PublicBookingController = class PublicBookingController {
    publicBookingService;
    constructor(publicBookingService) {
        this.publicBookingService = publicBookingService;
    }
    getBusinessInfo(biz) {
        return this.publicBookingService.getBusinessInfo(biz);
    }
    listServices(biz) {
        return this.publicBookingService.listServices(biz);
    }
    getSlots(biz, query) {
        return this.publicBookingService.getSlots(biz, query);
    }
    createBooking(biz, dto) {
        return this.publicBookingService.createBooking(biz, dto);
    }
};
exports.PublicBookingController = PublicBookingController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':biz'),
    __param(0, (0, common_1.Param)('biz')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicBookingController.prototype, "getBusinessInfo", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':biz/services'),
    __param(0, (0, common_1.Param)('biz')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicBookingController.prototype, "listServices", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':biz/slots'),
    __param(0, (0, common_1.Param)('biz')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, query_slots_dto_1.QuerySlotsDto]),
    __metadata("design:returntype", void 0)
], PublicBookingController.prototype, "getSlots", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)(':biz'),
    __param(0, (0, common_1.Param)('biz')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_public_booking_dto_1.CreatePublicBookingDto]),
    __metadata("design:returntype", void 0)
], PublicBookingController.prototype, "createBooking", null);
exports.PublicBookingController = PublicBookingController = __decorate([
    (0, common_1.Controller)('public/booking'),
    __metadata("design:paramtypes", [public_booking_service_1.PublicBookingService])
], PublicBookingController);
//# sourceMappingURL=public-booking.controller.js.map