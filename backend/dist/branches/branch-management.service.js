"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchManagementService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const bcrypt = __importStar(require("bcrypt"));
const prisma_service_1 = require("../prisma/prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const slug_util_1 = require("../common/utils/slug.util");
const branches_constants_1 = require("./branches.constants");
const prisma_1 = require("../../generated/prisma");
const BCRYPT_ROUNDS = 10;
let BranchManagementService = class BranchManagementService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(callerBusinessId, dto) {
        if (!dto.ownerEmail && !dto.ownerPhone) {
            throw new app_exception_1.AppException(branches_constants_1.BRANCH_ERROR_CODES.IDENTITY_REQUIRED, 'An email or phone number is required for the new branch owner', common_1.HttpStatus.BAD_REQUEST);
        }
        const caller = await this.prisma.business.findUniqueOrThrow({
            where: { id: callerBusinessId },
        });
        const rootId = caller.parentId ?? caller.id;
        const identityFilters = [];
        if (dto.ownerEmail)
            identityFilters.push({ email: dto.ownerEmail });
        if (dto.ownerPhone)
            identityFilters.push({ phone: dto.ownerPhone });
        const existingUser = await this.prisma.user.findFirst({
            where: { OR: identityFilters },
        });
        const branch = await this.prisma.business.create({
            data: {
                name: dto.name,
                slug: (0, slug_util_1.slugify)(dto.name),
                parentId: rootId,
                country: dto.country,
                currency: dto.currency ?? caller.currency,
                timezone: dto.timezone ?? caller.timezone,
            },
        });
        let tempPassword;
        let user = existingUser;
        if (!user) {
            tempPassword = (0, crypto_1.randomBytes)(branches_constants_1.BRANCH_TEMP_PASSWORD_BYTES).toString('hex');
            const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
            user = await this.prisma.user.create({
                data: {
                    name: dto.ownerName,
                    email: dto.ownerEmail,
                    phone: dto.ownerPhone,
                    passwordHash,
                },
            });
        }
        const businessUser = await this.prisma.businessUser.create({
            data: { businessId: branch.id, userId: user.id, role: prisma_1.Role.owner },
            include: { user: true },
        });
        return { business: branch, businessUser, tempPassword };
    }
    async list(businessId) {
        const business = await this.prisma.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const rootId = business.parentId ?? business.id;
        return this.prisma.business.findMany({
            where: { OR: [{ id: rootId }, { parentId: rootId }] },
            orderBy: { createdAt: 'asc' },
        });
    }
};
exports.BranchManagementService = BranchManagementService;
exports.BranchManagementService = BranchManagementService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BranchManagementService);
//# sourceMappingURL=branch-management.service.js.map