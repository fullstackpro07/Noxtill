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
exports.TwoFactorService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const bcrypt = __importStar(require("bcrypt"));
const prisma_service_1 = require("../prisma/prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const send_gate_service_1 = require("../messaging/send-gate.service");
const two_factor_constants_1 = require("./two-factor.constants");
const BCRYPT_ROUNDS = 10;
let TwoFactorService = class TwoFactorService {
    prisma;
    sendGate;
    constructor(prisma, sendGate) {
        this.prisma = prisma;
        this.sendGate = sendGate;
    }
    async generateAndSend(userId, businessId, phone) {
        const code = (0, crypto_1.randomInt)(100_000, 999_999).toString();
        const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
        const expiresAt = new Date(Date.now() + two_factor_constants_1.TWO_FACTOR_CODE_TTL_MINUTES * 60_000);
        await this.prisma.twoFactorCode.create({
            data: { userId, codeHash, expiresAt },
        });
        await this.sendGate.send({
            businessId,
            templateKey: two_factor_constants_1.OTP_TEMPLATE_KEY,
            to: { phone },
            variables: {
                code,
                ttlMinutes: String(two_factor_constants_1.TWO_FACTOR_CODE_TTL_MINUTES),
            },
        });
    }
    async verify(userId, code) {
        const pending = await this.prisma.twoFactorCode.findFirst({
            where: { userId, consumedAt: null },
            orderBy: { createdAt: 'desc' },
        });
        if (!pending) {
            throw new app_exception_1.AppException(two_factor_constants_1.TWO_FACTOR_ERROR_CODES.CODE_INVALID, 'No pending verification code — request a new one', common_1.HttpStatus.BAD_REQUEST);
        }
        if (pending.expiresAt < new Date()) {
            throw new app_exception_1.AppException(two_factor_constants_1.TWO_FACTOR_ERROR_CODES.CODE_EXPIRED, 'This code has expired — request a new one', common_1.HttpStatus.BAD_REQUEST);
        }
        if (pending.attempts >= two_factor_constants_1.TWO_FACTOR_MAX_ATTEMPTS) {
            throw new app_exception_1.AppException(two_factor_constants_1.TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS, 'Too many incorrect attempts — request a new code', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const matches = await bcrypt.compare(code, pending.codeHash);
        if (!matches) {
            await this.prisma.twoFactorCode.update({
                where: { id: pending.id },
                data: { attempts: { increment: 1 } },
            });
            throw new app_exception_1.AppException(two_factor_constants_1.TWO_FACTOR_ERROR_CODES.CODE_INVALID, 'Incorrect code', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.prisma.twoFactorCode.update({
            where: { id: pending.id },
            data: { consumedAt: new Date() },
        });
    }
};
exports.TwoFactorService = TwoFactorService;
exports.TwoFactorService = TwoFactorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        send_gate_service_1.SendGateService])
], TwoFactorService);
//# sourceMappingURL=two-factor.service.js.map