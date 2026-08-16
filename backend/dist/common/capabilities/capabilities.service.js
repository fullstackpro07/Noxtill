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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilitiesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const capabilities_constants_1 = require("./capabilities.constants");
let CapabilitiesService = class CapabilitiesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async resolve(businessUser) {
        if (!businessUser.customRoleId) {
            return capabilities_constants_1.SYSTEM_ROLE_CAPABILITIES[businessUser.role];
        }
        const customRole = await this.prisma.customRole.findUnique({
            where: { id: businessUser.customRoleId },
        });
        if (!customRole) {
            return capabilities_constants_1.SYSTEM_ROLE_CAPABILITIES[businessUser.role];
        }
        return customRole.capabilities;
    }
};
exports.CapabilitiesService = CapabilitiesService;
exports.CapabilitiesService = CapabilitiesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CapabilitiesService);
//# sourceMappingURL=capabilities.service.js.map