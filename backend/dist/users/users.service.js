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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async me(authUser) {
        const user = await this.prisma.user.findUnique({
            where: { id: authUser.sub },
            select: { id: true, name: true, email: true, phone: true },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const business = await this.prisma.business.findUnique({
            where: { id: authUser.businessId },
            select: {
                id: true,
                name: true,
                slug: true,
                currency: true,
                locale: true,
                timezone: true,
                country: true,
                parentId: true,
                branches: { select: { id: true, name: true } },
            },
        });
        if (!business)
            throw new common_1.NotFoundException('Business not found');
        const businessUser = await this.prisma.businessUser.findUnique({
            where: {
                businessId_userId: { businessId: authUser.businessId, userId: authUser.sub },
            },
            select: { id: true },
        });
        return {
            user: { ...user, role: authUser.role, businessUserId: businessUser?.id ?? null },
            business,
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map